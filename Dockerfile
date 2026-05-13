FROM node:20

# Install required tools
RUN apt-get update && apt-get install -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    ghostscript \
    imagemagick \
    && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p temp

EXPOSE 3000

CMD ["node", "server.js"]
