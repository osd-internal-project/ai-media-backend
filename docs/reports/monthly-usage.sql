-- Monthly usage report: credit / token / image / video (success, failed) per org, project, user.
-- Read-only. Definitions match services/core/src/dashboard/dashboard.service.ts (summaryUser):
--   image -> used_image (image quota), other types -> used_credit; "used" counts success only.
--   failed rows keep the held used_credit but were refunded -> credit_refunded, not credit_used.
-- level: organization | project | org_user (all projects) | project_user
-- เปลี่ยนเดือนที่ month_start (วันที่ 1 ของเดือน, เวลาไทย)
WITH params AS (
  SELECT DATE '2026-10-01' AS month_start
),
bounds AS (
  SELECT month_start,
         (month_start::timestamp AT TIME ZONE 'Asia/Bangkok')                       AS from_tz,
         ((month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Bangkok') AS to_tz
  FROM params
),
gen AS (  -- log.created_at เป็น timestamp ไม่มี tz ที่ Prisma เก็บเป็น UTC
  SELECT p.organization_id, l.project_id, l.user_id, l.type_generate,
         CASE WHEN lower(l.status) IN ('success','completed') THEN 'success'
              WHEN lower(l.status) IN ('failed','error')      THEN 'failed'
              ELSE 'in_progress' END                             AS st,
         COALESCE(l.used_credit,0) AS used_credit, COALESCE(l.used_image,0) AS used_image,
         COALESCE(l.token_used,0)  AS token_used,
         0 AS chat_prompt, 0 AS chat_completion, 0 AS chat_total, 1 AS is_gen
  FROM log l
  JOIN project p ON p.id = l.project_id
  CROSS JOIN bounds b
  WHERE l.created_at >= (b.from_tz AT TIME ZONE 'UTC')
    AND l.created_at <  (b.to_tz   AT TIME ZONE 'UTC')
),
chat AS (
  SELECT c.organization_id, c.project_id, c.user_id, NULL::text AS type_generate, NULL AS st,
         0, 0, 0,
         t.prompt_tokens, t.completion_tokens, t.total_tokens, 0
  FROM chat_token_usage t
  JOIN chat_conversation c ON c.id = t.conversation_id
  CROSS JOIN bounds b
  WHERE t.created_at >= b.from_tz AND t.created_at < b.to_tz
),
events AS (SELECT * FROM gen UNION ALL SELECT * FROM chat),
agg AS (
  SELECT
    CASE GROUPING(project_id, user_id)
      WHEN 3 THEN 'organization' WHEN 1 THEN 'project'
      WHEN 2 THEN 'org_user'     ELSE 'project_user' END                         AS level,
    organization_id, project_id, user_id,
    SUM(is_gen)                                                                  AS gen_total,
    COUNT(*) FILTER (WHERE st='success')                                         AS gen_success,
    COUNT(*) FILTER (WHERE st='failed')                                          AS gen_failed,
    COUNT(*) FILTER (WHERE st='in_progress')                                     AS gen_in_progress,
    COUNT(*) FILTER (WHERE type_generate='image' AND st='success')               AS image_success,
    COUNT(*) FILTER (WHERE type_generate='image' AND st='failed')                AS image_failed,
    SUM(used_image) FILTER (WHERE type_generate='image' AND st='success')        AS images_used,
    COUNT(*) FILTER (WHERE type_generate='video' AND st='success')               AS video_success,
    COUNT(*) FILTER (WHERE type_generate='video' AND st='failed')                AS video_failed,
    COUNT(*) FILTER (WHERE type_generate IN ('omnihumen','omnihuman','dreamactor','audio') AND st='success') AS other_success,
    COUNT(*) FILTER (WHERE type_generate IN ('omnihumen','omnihuman','dreamactor','audio') AND st='failed')  AS other_failed,
    SUM(used_credit) FILTER (WHERE type_generate<>'image' AND st='success')      AS credit_used,
    SUM(used_credit) FILTER (WHERE type_generate<>'image' AND st='failed')       AS credit_refunded,
    SUM(used_credit) FILTER (WHERE type_generate<>'image' AND st='in_progress')  AS credit_on_hold,
    SUM(token_used)  FILTER (WHERE type_generate='video'      AND st='success')  AS video_tokens,
    SUM(token_used)  FILTER (WHERE type_generate IN ('omnihumen','omnihuman') AND st='success') AS omnihuman_tokens,
    SUM(token_used)  FILTER (WHERE type_generate='dreamactor' AND st='success')  AS dreamactor_tokens,
    SUM(token_used)  FILTER (WHERE type_generate='audio'      AND st='success')  AS audio_tokens,
    SUM(chat_prompt)  AS chat_prompt_tokens,
    SUM(chat_completion) AS chat_completion_tokens,
    SUM(chat_total)   AS chat_total_tokens
  FROM events
  GROUP BY GROUPING SETS (
    (organization_id),
    (organization_id, project_id),
    (organization_id, user_id),
    (organization_id, project_id, user_id)
  )
)
SELECT
  to_char(b.month_start,'YYYY-MM')                                     AS month,
  a.level, a.organization_id, o.name AS organization_name,
  a.project_id, pr.name AS project_name,
  a.user_id, u.username, u.fullname,
  a.gen_total, a.gen_success, a.gen_failed, a.gen_in_progress,
  ROUND(100.0 * a.gen_success / NULLIF(a.gen_success + a.gen_failed,0), 2) AS success_rate_pct,
  a.image_success, a.image_failed, COALESCE(a.images_used,0) AS images_used,
  a.video_success, a.video_failed, a.other_success, a.other_failed,
  COALESCE(a.credit_used,0) AS credit_used, COALESCE(a.credit_refunded,0) AS credit_refunded,
  COALESCE(a.credit_on_hold,0) AS credit_on_hold,
  -- usage per type: image = number of images (images_used), everything else = tokens
  COALESCE(a.video_tokens,0) AS video_tokens, COALESCE(a.omnihuman_tokens,0) AS omnihuman_tokens,
  COALESCE(a.dreamactor_tokens,0) AS dreamactor_tokens, COALESCE(a.audio_tokens,0) AS audio_tokens,
  a.chat_prompt_tokens, a.chat_completion_tokens, a.chat_total_tokens,
  COALESCE(a.video_tokens,0) + COALESCE(a.omnihuman_tokens,0) + COALESCE(a.dreamactor_tokens,0)
    + COALESCE(a.audio_tokens,0) + a.chat_total_tokens AS total_tokens,
  ROUND((100.0 * COALESCE(a.credit_used,0) / NULLIF(
    MAX(a.credit_used) FILTER (WHERE a.level='organization') OVER (PARTITION BY a.organization_id),0))::numeric, 2) AS pct_of_org_credit
FROM agg a
CROSS JOIN bounds b
LEFT JOIN organization o ON o.organization_id = a.organization_id
LEFT JOIN project pr     ON pr.id = a.project_id
LEFT JOIN users u        ON u.user_id = a.user_id
ORDER BY o.name NULLS LAST,
         array_position(ARRAY['organization','project','project_user','org_user'], a.level),
         pr.name NULLS FIRST, credit_used DESC;
