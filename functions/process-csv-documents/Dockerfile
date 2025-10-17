FROM public.ecr.aws/lambda/nodejs:22

COPY dist/app.mjs ${LAMBDA_TASK_ROOT}

CMD [ "app.handler" ]
