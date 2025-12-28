import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    const dataDir = path.join(__dirname, '../seed/data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log('🚀 Starting export...');

    // 1. MasterModelType
    const masterModelTypes = await prisma.masterModelType.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'master_model_type.json'),
        JSON.stringify(masterModelTypes, null, 2)
    );
    console.log(`✅ Exported MasterModelType: ${masterModelTypes.length}`);

    // 2. MasterDataConfigApi
    const masterDataConfigApis = await prisma.masterDataConfigApi.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'master_data_config_api.json'),
        JSON.stringify(masterDataConfigApis, null, 2)
    );
    console.log(`✅ Exported MasterDataConfigApi: ${masterDataConfigApis.length}`);

    // 3. Role
    const roles = await prisma.role.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'role.json'),
        JSON.stringify(roles, null, 2)
    );
    console.log(`✅ Exported Role: ${roles.length}`);

    // 4. Groups
    const groups = await prisma.groups.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'groups.json'),
        JSON.stringify(groups, null, 2)
    );
    console.log(`✅ Exported Groups: ${groups.length}`);

    // 5. GroupRole
    const groupRoles = await prisma.groupRole.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'group_role.json'),
        JSON.stringify(groupRoles, null, 2)
    );
    console.log(`✅ Exported GroupRole: ${groupRoles.length}`);

    // 6. Users
    const users = await prisma.users.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'users.json'),
        JSON.stringify(users, null, 2)
    );
    console.log(`✅ Exported Users: ${users.length}`);

    // 7. UserGroup
    const userGroups = await prisma.userGroup.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'user_group.json'),
        JSON.stringify(userGroups, null, 2)
    );
    console.log(`✅ Exported UserGroup: ${userGroups.length}`);

    // 8. Organization
    const organizations = await prisma.organization.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'organization.json'),
        JSON.stringify(organizations, null, 2)
    );
    console.log(`✅ Exported Organization: ${organizations.length}`);

    // 9. OrganizationMember
    const organizationMembers = await prisma.organizationMember.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'organization_member.json'),
        JSON.stringify(organizationMembers, null, 2)
    );
    console.log(`✅ Exported OrganizationMember: ${organizationMembers.length}`);

    // 10. Project
    const projects = await prisma.project.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'project.json'),
        JSON.stringify(projects, null, 2)
    );
    console.log(`✅ Exported Project: ${projects.length}`);

    // 11. ProjectMember
    const projectMembers = await prisma.projectMember.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'project_member.json'),
        JSON.stringify(projectMembers, null, 2)
    );
    console.log(`✅ Exported ProjectMember: ${projectMembers.length}`);

    // 12. Gallery
    const galleries = await prisma.gallery.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'gallery.json'),
        JSON.stringify(galleries, null, 2)
    );
    console.log(`✅ Exported Gallery: ${galleries.length}`);

    // 13. Log
    const logs = await prisma.log.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'log.json'),
        JSON.stringify(logs, null, 2)
    );
    console.log(`✅ Exported Log: ${logs.length}`);

    // 14. PromptGuideType
    const promptGuideTypes = await prisma.promptGuideType.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'prompt_guide_type.json'),
        JSON.stringify(promptGuideTypes, null, 2)
    );
    console.log(`✅ Exported PromptGuideType: ${promptGuideTypes.length}`);

    // 15. PromptGuide
    const promptGuides = await prisma.promptGuide.findMany();
    fs.writeFileSync(
        path.join(dataDir, 'prompt_guide.json'),
        JSON.stringify(promptGuides, null, 2)
    );
    console.log(`✅ Exported PromptGuide: ${promptGuides.length}`);

    console.log('🏁 Export completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
