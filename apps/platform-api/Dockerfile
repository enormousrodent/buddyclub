# Container image for the platform API (ADR-012). Build from the repository root:
#   docker build -f apps/platform-api/Dockerfile -t buddyclub-platform-api .
# Not yet exercised in CI; verify before first deployment.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @buddyclub/platform-api build
RUN pnpm --filter @buddyclub/platform-api --legacy deploy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
