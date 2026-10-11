FROM node:24-bookworm-slim
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node . .
USER node
# One dependency/build layer avoids copying the entire dependency tree through
# each layer on cloud Docker hosts using the vfs storage driver.
RUN --mount=type=secret,id=build_ca,mode=0444 \
    if [ -f /run/secrets/build_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci; else npm ci; fi \
    && DATABASE_URL=postgresql://localhost/the_move npx prisma generate \
    && npm run build \
    && npm cache clean --force
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
