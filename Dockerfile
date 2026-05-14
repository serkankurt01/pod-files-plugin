FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html/pod-files-plugin
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 9001
CMD ["nginx", "-g", "daemon off;"]
