# 1.0.0 (2025-12-28)


### Bug Fixes

* Await all image generation and storage operations and specify package manager in package.json. ([884a508](https://github.com/osd-internal-project/ai-media-backend/commit/884a508ed4d5aa422305b7d9582a896b1a201cc3))


### Features

* Add `organizationId` to `PromptGuideType`, enable organization-based filtering for prompt guides and types, and add user membership lookup by token. ([b8bde86](https://github.com/osd-internal-project/ai-media-backend/commit/b8bde860896b08900c660d901d983f62fb81e428))
* add Minio presigned URL generation and define package manager in package.json. ([a5d07e6](https://github.com/osd-internal-project/ai-media-backend/commit/a5d07e67478c75b0ae23219385f7b2102b23b0d6))
* Add Minio presigned URL generation for video logs and update image/video URL storage logic. ([b3af0b0](https://github.com/osd-internal-project/ai-media-backend/commit/b3af0b0e4613f177b70b6bedb476ebcf26b8d8ff))
* Add OpenVPN configuration and CI/CD workflow for backend services ([ba034b7](https://github.com/osd-internal-project/ai-media-backend/commit/ba034b7b59fe7d3e8b1661c2155703980d73d85b))
* Add video thumbnail generation, implement pagination for logs, and switch video serving to presigned URLs. ([8332adf](https://github.com/osd-internal-project/ai-media-backend/commit/8332adff64f645b1b4571771774d296bfc856102))
* Generate presigned URLs for image and thumbnail logs in the log service. ([d63b97f](https://github.com/osd-internal-project/ai-media-backend/commit/d63b97f8b4068c9404f58ec6b1ea8b09eec5f9a1))
* Implement image generation, gallery management, and MinIO storage integration. ([99dfe3a](https://github.com/osd-internal-project/ai-media-backend/commit/99dfe3a33b58de03973b4df81b6571dc229ab616))
* Implement Minio presigned URL generation for gallery and logs, add Minio SSL config, and update public Minio URL endpoint to use query parameters. ([2daa29b](https://github.com/osd-internal-project/ai-media-backend/commit/2daa29b88af8f2f44d188ec04be694f884fb4c6a))
* Implement new Omnihumen, AI Model, Prompt Guide Type, and Organization features with updated data models, seeding, and CI/CD workflows. ([5dcb674](https://github.com/osd-internal-project/ai-media-backend/commit/5dcb6749283e79c15efaba07708a087db6df41a1))
* Implement omnihuman generation with token-based user authentication, dynamic media URLs, and SSL bypass for external API calls.** ([517d763](https://github.com/osd-internal-project/ai-media-backend/commit/517d763e0a6ed03768b5dd7ee9be3f88d6f2f629))
* Implement Omnihumen module with file upload handling, public file serving, and updated MinIO/BytePlus configurations. ([a10a754](https://github.com/osd-internal-project/ai-media-backend/commit/a10a754fd121bf14f5ccb4e5cab1849d7f8baac0))
* Implement Omnihumen task management with Byteplus API integration and scheduled status checks. ([22022a5](https://github.com/osd-internal-project/ai-media-backend/commit/22022a5421959cbb29b31feb205b143996f4c684))
* Implement Omnihumen task management with scheduled status checks using Byteplus API. ([710fb6e](https://github.com/osd-internal-project/ai-media-backend/commit/710fb6eaaa3089178a9ba1fa1305f9e54ef852af))
* Implement Prisma database seeding with initial data and a new migration. ([4574b6a](https://github.com/osd-internal-project/ai-media-backend/commit/4574b6a8e963a88d23124193f28684ee8090d0fd))
* Implement user detail management and project organization filtering by token, and add video generation support. ([28e9c00](https://github.com/osd-internal-project/ai-media-backend/commit/28e9c00d90c07b65e11fd80dfc0c876654829759))
* Introduce Redis module and implement caching for Minio presigned URLs. ([39be7ef](https://github.com/osd-internal-project/ai-media-backend/commit/39be7ef2b4cdf97b54f9559f88b2c5f02390c472))
* Introduce semantic release configuration, add extensive Prisma seed data, and update Prisma environment files and dependencies. ([dd5148a](https://github.com/osd-internal-project/ai-media-backend/commit/dd5148afe2242c49d1437e1544bb50ed7f855ce6))
* Update image generation and MinIO client services, and configure yarn package manager in package.json. ([15d2d8a](https://github.com/osd-internal-project/ai-media-backend/commit/15d2d8a75a1329df23e31b3b727ceebde371f6de))
* Update image generation service, core Dockerfile, and dependencies for improved functionality. ([8e0bd14](https://github.com/osd-internal-project/ai-media-backend/commit/8e0bd14d42afc8793ac6452b74a9c9ac8aecafbc))
* Update package configurations, Dockerfile, image generation, and MinIO client services. ([f0fbf01](https://github.com/osd-internal-project/ai-media-backend/commit/f0fbf01000ff36f371815695c43b5f8d3f57bb44))
