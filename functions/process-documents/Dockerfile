FROM node:22 AS builder

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build


FROM public.ecr.aws/shelf/lambda-libreoffice-base:25.2-node22-x86_64 AS runtime

COPY --from=builder /app/dist/ ./
COPY --from=builder /app/package*.json ./

RUN npm install --only=production

CMD [ "app.handler" ] 