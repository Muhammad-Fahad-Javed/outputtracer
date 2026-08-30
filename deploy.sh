#!/bin/bash
# Exit on any error
set -e

echo "Starting Deployment Script for OutputTracer..."

# 1. Update packages and install prerequisites
echo "Installing Nginx, Docker, and Certbot..."
sudo apt update
sudo apt install -y nginx docker.io certbot python3-certbot-nginx

# Start and enable docker
sudo systemctl enable docker
sudo systemctl start docker

# 2. Configure Nginx
echo "Configuring Nginx for muhammad-fahad-javed.is-a.dev..."
cat << 'EOF' | sudo tee /etc/nginx/sites-available/outputtracer
server {
    listen 80;
    server_name muhammad-fahad-javed.is-a.dev;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/outputtracer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 3. Docker Build and Run
echo "Building and running OutputTracer Docker container..."
# Stop and remove existing container if it exists
sudo docker rm -f outputtracer-app || true

sudo docker build -t outputtracer .
sudo docker run -d --restart always -p 3000:3000 --name outputtracer-app outputtracer

echo "--------------------------------------------------------"
echo "Deployment almost complete!"
echo "Make sure your code is uploaded to this directory before running."
echo "If DNS has propagated, run the following command to get your SSL certificate:"
echo "sudo certbot --nginx -d muhammad-fahad-javed.is-a.dev"
echo "--------------------------------------------------------"
