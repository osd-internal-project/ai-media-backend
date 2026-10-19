FROM node:22.23.3-alpine3.24 AS base
RUN apk upgrade --update-cache && \
    apk add --no-cache openssl musl tzdata && \
    rm -rf /var/cache/apk/*
WORKDIR /app
ENV YARN_CACHE_FOLDER=/tmp/yarn-cache
ENV TZ=Asia/Bangkok

# pruner
FROM base AS pruner
RUN yarn global add turbo@1.5.5
COPY . .
RUN turbo prune --scope="@ai-media/core" --docker
RUN yarn global remove turbo

# development dependencies
FROM base AS dev-deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
# เพิ่ม --ignore-engines flag
RUN yarn install --frozen-lockfile --ignore-engines

# production dependencies
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
# เพิ่ม --ignore-engines flag
RUN yarn install --frozen-lockfile --production --ignore-engines

# build
FROM base AS builder
COPY --from=dev-deps /app/ .
COPY --from=pruner /app/out/full/ .
RUN yarn generate
RUN yarn turbo run build --scope="@ai-media/core" --include-dependencies --no-deps
RUN find . -name node_modules | xargs rm -rf

# final
FROM base AS runner
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/ .
RUN yarn generate

WORKDIR /app/services/core
USER node
CMD ["node", "dist/main"]