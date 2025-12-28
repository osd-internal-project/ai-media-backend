import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ Do not run seed on production');
    }

    const dataDir = path.join(__dirname, 'data');
    console.log(`📂 Reading seed data from: ${dataDir}`);

    const loadJson = (filename: string) => {
        const filePath = path.join(dataDir, filename);
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        }
        return null;
    };

    // 1. MasterModelType
    const masterModelTypes = loadJson('master_model_type.json');
    if (masterModelTypes) {
        console.log(`Creating ${masterModelTypes.length} MasterModelTypes...`);
        for (const item of masterModelTypes) {
            await prisma.masterModelType.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 2. MasterDataConfigApi
    const masterDataConfigApis = loadJson('master_data_config_api.json');
    if (masterDataConfigApis) {
        console.log(`Creating ${masterDataConfigApis.length} MasterDataConfigApis...`);
        for (const item of masterDataConfigApis) {
            await prisma.masterDataConfigApi.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 3. User & Role & Groups (Independent first)

    // Roles
    const roles = loadJson('role.json');
    if (roles) {
        console.log(`Creating ${roles.length} Roles...`);
        for (const item of roles) {
            await prisma.role.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // Groups
    const groups = loadJson('groups.json');
    if (groups) {
        console.log(`Creating ${groups.length} Groups...`);
        for (const item of groups) {
            await prisma.groups.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // GroupRole (Dependent on Groups and Roles)
    const groupRoles = loadJson('group_role.json');
    if (groupRoles) {
        console.log(`Creating ${groupRoles.length} GroupRoles...`);
        // GroupRole has composite unique key, so we use createMany with skipDuplicates or upsert with checking
        // Since upsert needs a unique identifier, and GroupRole has (groupId, roleId), we can use that.
        for (const item of groupRoles) {
            await prisma.groupRole.upsert({
                where: {
                    groupId_roleId: {
                        groupId: item.groupId,
                        roleId: item.roleId,
                    }
                },
                update: item,
                create: item,
            });
        }
    }

    // Users
    const users = loadJson('users.json');
    if (users) {
        console.log(`Creating ${users.length} Users...`);
        for (const item of users) {
            await prisma.users.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // UserGroup (Dependent on Users and Groups)
    const userGroups = loadJson('user_group.json');
    if (userGroups) {
        console.log(`Creating ${userGroups.length} UserGroups...`);
        for (const item of userGroups) {
            await prisma.userGroup.upsert({
                where: {
                    userId_groupId: {
                        userId: item.userId,
                        groupId: item.groupId,
                    }
                },
                update: item,
                create: item,
            });
        }
    }

    // 4. Organization
    const organizations = loadJson('organization.json');
    if (organizations) {
        console.log(`Creating ${organizations.length} Organizations...`);
        for (const item of organizations) {
            await prisma.organization.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // OrganizationMember
    const organizationMembers = loadJson('organization_member.json');
    if (organizationMembers) {
        console.log(`Creating ${organizationMembers.length} OrganizationMembers...`);
        // This fails if there is no unique constraint on OrganizationMember that we can easy target for upsert with arbitrary ID
        // But the schema says: unique([projectId, userId]) for ProjectMember, but for OrgMember?
        // Schema: model OrganizationMember ... @unique is NOT explicitly defined on (organizationId, userId) in the version I saw?
        // Wait, looking at schema provided earlier:
        // model OrganizationMember { id @unique ... } -> It has a unique ID.

        for (const item of organizationMembers) {
            await prisma.organizationMember.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 5. Project
    const projects = loadJson('project.json');
    if (projects) {
        console.log(`Creating ${projects.length} Projects...`);
        for (const item of projects) {
            await prisma.project.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // ProjectMember
    const projectMembers = loadJson('project_member.json');
    if (projectMembers) {
        console.log(`Creating ${projectMembers.length} ProjectMembers...`);
        for (const item of projectMembers) {
            await prisma.projectMember.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 6. Gallery
    const galleries = loadJson('gallery.json');
    if (galleries) {
        console.log(`Creating ${galleries.length} Gallery items...`);
        for (const item of galleries) {
            await prisma.gallery.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 7. Log
    const logs = loadJson('log.json');
    if (logs) {
        console.log(`Creating ${logs.length} Logs...`);
        for (const item of logs) {
            await prisma.log.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 8. PromptGuideType
    const promptGuideTypes = loadJson('prompt_guide_type.json');
    if (promptGuideTypes) {
        console.log(`Creating ${promptGuideTypes.length} PromptGuideTypes...`);
        for (const item of promptGuideTypes) {
            await prisma.promptGuideType.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    // 9. PromptGuide
    const promptGuides = loadJson('prompt_guide.json');
    if (promptGuides) {
        console.log(`Creating ${promptGuides.length} PromptGuides...`);
        for (const item of promptGuides) {
            await prisma.promptGuide.upsert({
                where: { id: item.id },
                update: item,
                create: item,
            });
        }
    }

    console.log('✅ Seed completed successfully');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
