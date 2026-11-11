-- Monthly usage per user (one row per user, all orgs/projects combined). Read-only.
-- Same definitions as monthly-usage.sql: "used" counts success only; image -> used_image, other types -> used_credit.
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
  SELECT l.user_id,
    COUNT(*) FILTER (WHERE lower(l.status) IN ('success','completed'))                                    AS gen_success,
    COUNT(*) FILTER (WHERE lower(l.status) IN ('failed','error'))                                         AS gen_failed,
    COUNT(*) FILTER (WHERE l.type_generate='image'      AND lower(l.status) IN ('success','completed'))   AS image_success,
    COUNT(*) FILTER (WHERE l.type_generate='image'      AND lower(l.status) IN ('failed','error'))        AS image_failed,
    COUNT(*) FILTER (WHERE l.type_generate='video'      AND lower(l.status) IN ('success','completed'))   AS video_success,
    COUNT(*) FILTER (WHERE l.type_generate='video'      AND lower(l.status) IN ('failed','error'))        AS video_failed,
    COUNT(*) FILTER (WHERE l.type_generate IN ('omnihumen','omnihuman') AND lower(l.status) IN ('success','completed')) AS omnihuman_success,
    COUNT(*) FILTER (WHERE l.type_generate IN ('omnihumen','omnihuman') AND lower(l.status) IN ('failed','error'))      AS omnihuman_failed,
    COUNT(*) FILTER (WHERE l.type_generate='dreamactor' AND lower(l.status) IN ('success','completed'))   AS dreamactor_success,
    COUNT(*) FILTER (WHERE l.type_generate='dreamactor' AND lower(l.status) IN ('failed','error'))        AS dreamactor_failed,
    COUNT(*) FILTER (WHERE l.type_generate='audio'      AND lower(l.status) IN ('success','completed'))   AS audio_success,
    COUNT(*) FILTER (WHERE l.type_generate='audio'      AND lower(l.status) IN ('failed','error'))        AS audio_failed,
    SUM(COALESCE(l.used_image,0))  FILTER (WHERE l.type_generate='image'  AND lower(l.status) IN ('success','completed')) AS images_used,
    SUM(COALESCE(l.used_credit,0)) FILTER (WHERE l.type_generate<>'image' AND lower(l.status) IN ('success','completed')) AS credit_used,
    SUM(COALESCE(l.used_credit,0)) FILTER (WHERE l.type_generate<>'image' AND lower(l.status) IN ('failed','error'))      AS credit_refunded,
    SUM(COALESCE(l.token_used,0))  FILTER (WHERE l.type_generate='video'      AND lower(l.status) IN ('success','completed')) AS video_tokens,
    SUM(COALESCE(l.token_used,0))  FILTER (WHERE l.type_generate IN ('omnihumen','omnihuman') AND lower(l.status) IN ('success','completed')) AS omnihuman_tokens,
    SUM(COALESCE(l.token_used,0))  FILTER (WHERE l.type_generate='dreamactor' AND lower(l.status) IN ('success','completed')) AS dreamactor_tokens,
    SUM(COALESCE(l.token_used,0))  FILTER (WHERE l.type_generate='audio'      AND lower(l.status) IN ('success','completed')) AS audio_tokens
  FROM log l
  CROSS JOIN bounds b
  WHERE l.created_at >= (b.from_tz AT TIME ZONE 'UTC')
    AND l.created_at <  (b.to_tz   AT TIME ZONE 'UTC')
  GROUP BY l.user_id
),
chat AS (
  SELECT c.user_id, SUM(t.total_tokens) AS chat_tokens
  FROM chat_token_usage t
  JOIN chat_conversation c ON c.id = t.conversation_id
  CROSS JOIN bounds b
  WHERE t.created_at >= b.from_tz AND t.created_at < b.to_tz
  GROUP BY c.user_id
)
SELECT
  to_char(b.month_start,'YYYY-MM')                                   AS month,
  u.user_id, u.username, u.fullname, u.email,
  COALESCE(g.credit_used,0)                                          AS credit_used,
  COALESCE(g.credit_refunded,0)                                      AS credit_refunded,
  -- usage per type: image = number of images, everything else = tokens
  COALESCE(g.images_used,0)                                          AS image_images,
  COALESCE(g.video_tokens,0)                                         AS video_tokens,
  COALESCE(g.omnihuman_tokens,0)                                     AS omnihuman_tokens,
  COALESCE(g.dreamactor_tokens,0)                                    AS dreamactor_tokens,
  COALESCE(g.audio_tokens,0)                                         AS audio_tokens,
  COALESCE(ch.chat_tokens,0)                                         AS chat_tokens,
  COALESCE(g.video_tokens,0) + COALESCE(g.omnihuman_tokens,0) + COALESCE(g.dreamactor_tokens,0)
    + COALESCE(g.audio_tokens,0) + COALESCE(ch.chat_tokens,0)        AS total_tokens,
  COALESCE(g.image_success,0)      AS image_success,      COALESCE(g.image_failed,0)      AS image_failed,
  COALESCE(g.video_success,0)      AS video_success,      COALESCE(g.video_failed,0)      AS video_failed,
  COALESCE(g.omnihuman_success,0)  AS omnihuman_success,  COALESCE(g.omnihuman_failed,0)  AS omnihuman_failed,
  COALESCE(g.dreamactor_success,0) AS dreamactor_success, COALESCE(g.dreamactor_failed,0) AS dreamactor_failed,
  COALESCE(g.audio_success,0)      AS audio_success,      COALESCE(g.audio_failed,0)      AS audio_failed,
  COALESCE(g.gen_success,0)        AS gen_success,        COALESCE(g.gen_failed,0)        AS gen_failed,
  ROUND(100.0 * g.gen_success / NULLIF(g.gen_success + g.gen_failed,0), 2) AS success_rate_pct
FROM users u
CROSS JOIN bounds b
LEFT JOIN gen  g  ON g.user_id  = u.user_id
LEFT JOIN chat ch ON ch.user_id = u.user_id
WHERE g.user_id IS NOT NULL OR ch.user_id IS NOT NULL
ORDER BY credit_used DESC, total_tokens DESC;
