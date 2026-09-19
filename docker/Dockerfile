FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
LABEL org.opencontainers.image.source="https://github.com/jaimetournesol/tag-convert"
WORKDIR /opt/tag-convert
COPY scripts ./scripts
COPY skills ./skills
COPY reference ./reference
COPY templates ./templates
COPY .codex-plugin ./.codex-plugin
COPY .claude-plugin ./.claude-plugin
COPY README.md ./README.md
RUN mkdir /state && chown node:node /state
USER node
ENV TAG_STATE_DIR=/state TAG_CONFIG_FILE=/config/config.json
ENTRYPOINT ["node", "/opt/tag-convert/scripts/mcp-server.mjs"]
