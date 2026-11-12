FROM nginx:1.30.6-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/ /usr/share/nginx/html/

RUN nginx -t

EXPOSE 80
