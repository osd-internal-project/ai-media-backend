# ===== Base image =====
FROM node:16.17.1-alpine3.16 AS base

# ติดตั้ง tzdata และ dependencies อื่น ๆ
RUN apk upgrade --update-cache && \
    apk add --no-cache tzdata openssl musl && \
    cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime && \
    echo "Asia/Bangkok" > /etc/timezone

ENV TZ=Asia/Bangkok
WORKDIR /app
ENV YARN_CACHE_FOLDER=.yarn-cache

# ===== Pruner stage =====
FROM base AS pruner
RUN yarn global add turbo@1.5.5
COPY . .
RUN turbo prune --scope="@ai-media/email-api" --docker
RUN yarn global remove turbo

# ===== Development dependencies =====
FROM base AS dev-deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
RUN yarn install --frozen-lockfile

# ===== Production dependencies =====
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
COPY --from=dev-deps /app/${YARN_CACHE_FOLDER} /${YARN_CACHE_FOLDER}
RUN yarn install --frozen-lockfile --production --prefer-offline
RUN rm -rf /app/${YARN_CACHE_FOLDER}

# ===== Build stage =====
FROM base AS builder
COPY --from=dev-deps /app/ .
COPY --from=pruner /app/out/full/ .
RUN yarn generate
RUN yarn turbo run build --scope="@ai-media/email-api" --include-dependencies --no-deps
RUN find . -name node_modules | xargs rm -rf

# ===== Clean dependencies (reduce size) =====
FROM base AS cleaner
RUN yarn global add modclean
COPY --from=prod-deps /app/ .
COPY --from=builder /app/ .
RUN yarn generate
RUN modclean --run
RUN yarn global remove modclean

# ===== Final image (runner) =====
FROM base AS runner
COPY --from=cleaner /app/ .
WORKDIR /app/services/email-api
USER node
CMD node dist/main