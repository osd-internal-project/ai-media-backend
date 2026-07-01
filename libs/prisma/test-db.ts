import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const query = `
    select o.id as "organizationId", o.name as "organizationName",
      (COALESCE(sub.image_allowance, 0) + COALESCE(cb.on_top_image, 0))::int as "packageImageAmount",
      (COALESCE(sub.credit_allowance, 0) + COALESCE(cb.on_top_balance, 0))::int as "packageTokenAmount", 
      (COALESCE(cb.current_cycle_image, 0) + COALESCE(cb.on_top_image, 0))::int as "remainImageAmount",
      (COALESCE(cb.current_cycle_balance, 0) + COALESCE(cb.on_top_balance, 0))::int as "remainTokenAmount",
      image_used::int as "imageUsed",token_used::int as "tokenUsed" from organization o 
    left join organization_subscriptions sub on o.organization_id = sub.organization_id
    left join credit_balances cb on o.organization_id = cb.organization_id
    left join  (select  p2.organization_id  as "organization_id" ,SUM(COALESCE(image_used,0)) as image_used, SUM(COALESCE(token_used,0)) as token_used from  project p2 
    left join ( select
        log."project_id",
        SUM(CASE WHEN log."type_generate" = 'image' THEN log."image_used" ELSE 0 END)::int as image_used,
        SUM(CASE WHEN log."type_generate" = 'video' THEN log."token_used" ELSE 0 END)::int as token_used
    from
        log where  log.status='success'   group by log."project_id" ) l on l."project_id" = p2.id
        group by p2.organization_id ) cal on o.organization_id = cal.organization_id limit 1;
  `
  const result: any = await prisma.$queryRawUnsafe(query);
  console.log(result)
}
main()
