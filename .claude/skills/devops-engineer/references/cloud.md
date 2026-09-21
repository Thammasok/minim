# Cloud Platforms Reference

## AWS

### EKS — production cluster setup
```bash
eksctl create cluster \
  --name production \
  --region us-east-1 \
  --version 1.29 \
  --nodegroup-name standard-workers \
  --node-type m5.xlarge \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed \
  --asg-access \
  --external-dns-access \
  --alb-ingress-access \
  --node-private-networking
```

### IAM — IRSA (K8s pods → AWS services, no static keys)
```hcl
# Terraform: create IRSA role
resource "aws_iam_role" "my_service" {
  name = "my-service-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" =
            "system:serviceaccount:production:my-service-sa"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "my_service" {
  role = aws_iam_role.my_service.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "arn:aws:s3:::my-bucket/*"
    }]
  })
}
```

### AWS networking — standard 3-tier VPC
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "main"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
  database_subnets = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false   # HA: one per AZ
  enable_dns_hostnames = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
```

### Common AWS services cheatsheet
| Need | AWS service |
|---|---|
| Container orchestration | EKS |
| Serverless containers | ECS Fargate |
| Object storage | S3 |
| Managed PostgreSQL | RDS Aurora PostgreSQL |
| Managed Redis | ElastiCache for Redis |
| CDN | CloudFront |
| DNS | Route 53 |
| Secrets | AWS Secrets Manager + ESO |
| Load balancer | ALB (HTTP) / NLB (TCP) |
| Message queue | SQS / EventBridge |
| Streaming | MSK (Kafka) / Kinesis |
| Observability | CloudWatch / X-Ray |

---

## GCP

### GKE — Autopilot (recommended for new clusters)
```bash
gcloud container clusters create-auto production \
  --region us-central1 \
  --release-channel regular \
  --workload-pool $(gcloud config get-value project).svc.id.goog
```

### Workload Identity (GKE → GCP services, no service account keys)
```bash
# Bind K8s SA to GCP SA
gcloud iam service-accounts add-iam-policy-binding \
  my-service@PROJECT.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT.svc.id.goog[production/my-service-sa]"

kubectl annotate serviceaccount my-service-sa \
  --namespace production \
  iam.gke.io/gcp-service-account=my-service@PROJECT.iam.gserviceaccount.com
```

### Common GCP services cheatsheet
| Need | GCP service |
|---|---|
| Container orchestration | GKE |
| Serverless containers | Cloud Run |
| Object storage | GCS |
| Managed PostgreSQL | Cloud SQL / AlloyDB |
| Managed Redis | Memorystore |
| CDN | Cloud CDN |
| DNS | Cloud DNS |
| Secrets | Secret Manager + ESO |
| Load balancer | Cloud Load Balancing |
| Message queue | Pub/Sub |
| Streaming | Dataflow / Pub/Sub |

---

## Azure

### AKS cluster
```bash
az aks create \
  --resource-group production \
  --name my-cluster \
  --node-count 3 \
  --enable-addons monitoring \
  --enable-managed-identity \
  --enable-workload-identity \
  --generate-ssh-keys
```

### Workload Identity (AKS → Azure services)
```bash
az identity create --name my-service-identity --resource-group production

az aks update --name my-cluster --resource-group production \
  --enable-workload-identity --enable-oidc-issuer
```

---

## DigitalOcean

### DOKS — Managed Kubernetes cluster

```bash
# Install doctl CLI
brew install doctl   # or: snap install doctl

# Authenticate
doctl auth init --access-token $DO_TOKEN

# Create a DOKS cluster
doctl kubernetes cluster create production \
  --region nyc3 \
  --version 1.29 \
  --node-pool "name=default;size=s-4vcpu-8gb;count=3;auto-scale=true;min-nodes=3;max-nodes=10" \
  --wait

# Merge kubeconfig
doctl kubernetes cluster kubeconfig save production
```

### DOKS — Terraform (recommended for reproducible infra)

```hcl
terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.39"
    }
  }
}

provider "digitalocean" {
  token = var.do_token   # set via TF_VAR_do_token env var — never hardcode
}

# VPC
resource "digitalocean_vpc" "main" {
  name     = "production-vpc"
  region   = "nyc3"
  ip_range = "10.10.0.0/16"
}

# DOKS cluster
resource "digitalocean_kubernetes_cluster" "production" {
  name     = "production"
  region   = "nyc3"
  version  = "1.29.1-do.0"
  vpc_uuid = digitalocean_vpc.main.id

  node_pool {
    name       = "default"
    size       = "s-4vcpu-8gb"
    auto_scale = true
    min_nodes  = 3
    max_nodes  = 10
    labels = {
      env = "production"
    }
  }
}

# Container Registry (DOCR)
resource "digitalocean_container_registry" "main" {
  name                   = "my-company"
  subscription_tier_slug = "basic"
  region                 = "nyc3"
}

# Grant cluster pull access to registry
resource "digitalocean_container_registry_docker_credentials" "production" {
  registry_name = digitalocean_container_registry.main.name
  write         = false
}
```

### App Platform — simple deploys (no K8s needed)

```yaml
# .do/app.yaml — committed to repo, deployed via doctl or GitHub integration
name: my-service
region: nyc
services:
  - name: api
    github:
      repo: my-org/my-service
      branch: main
      deploy_on_push: true
    build_command: npm run build
    run_command: node dist/server.js
    http_port: 3000
    instance_size_slug: professional-xs
    instance_count: 2
    health_check:
      http_path: /healthz
      initial_delay_seconds: 15
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}   # references managed DB component
        type: SECRET
    routes:
      - path: /

databases:
  - name: db
    engine: PG
    version: "16"
    size: db-s-1vcpu-1gb
    num_nodes: 1
    production: false   # set true for HA (2 standby nodes)
```

```bash
# Deploy via doctl
doctl apps create --spec .do/app.yaml
doctl apps update <app-id> --spec .do/app.yaml

# List apps and get live URL
doctl apps list
doctl apps get <app-id> --format LiveURL
```

### Managed Database (PostgreSQL)

```hcl
resource "digitalocean_database_cluster" "postgres" {
  name       = "production-db"
  engine     = "pg"
  version    = "16"
  size       = "db-s-2vcpu-4gb"
  region     = "nyc3"
  node_count = 2            # 1 primary + 1 standby = HA

  private_network_uuid = digitalocean_vpc.main.id
}

# Firewall: allow only the K8s cluster to connect
resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "k8s"
    value = digitalocean_kubernetes_cluster.production.id
  }
}

# Separate app user (not the admin user)
resource "digitalocean_database_user" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "my-service"
}

resource "digitalocean_database_db" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "mydb"
}
```

### Spaces (S3-compatible object storage)

```hcl
resource "digitalocean_spaces_bucket" "assets" {
  name   = "my-company-assets"
  region = "nyc3"
  acl    = "private"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    enabled = true
    expiration {
      days = 90   # clean up old uploads
    }
  }
}
```

```bash
# Use with any S3-compatible SDK — set endpoint
AWS_ACCESS_KEY_ID=$DO_SPACES_KEY \
AWS_SECRET_ACCESS_KEY=$DO_SPACES_SECRET \
aws s3 ls s3://my-company-assets \
  --endpoint-url https://nyc3.digitaloceanspaces.com
```

### Load Balancer

```hcl
resource "digitalocean_loadbalancer" "main" {
  name     = "production-lb"
  region   = "nyc3"
  vpc_uuid = digitalocean_vpc.main.id

  forwarding_rule {
    entry_port      = 443
    entry_protocol  = "https"
    target_port     = 80
    target_protocol = "http"
    certificate_name = digitalocean_certificate.main.name
  }

  forwarding_rule {
    entry_port      = 80
    entry_protocol  = "http"
    target_port     = 80
    target_protocol = "http"
  }

  healthcheck {
    port     = 80
    protocol = "http"
    path     = "/healthz"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    interval_seconds    = 10
  }

  redirect_http_to_https = true
  droplet_tag            = "production"
}

resource "digitalocean_certificate" "main" {
  name    = "production-cert"
  type    = "lets_encrypt"
  domains = ["example.com", "www.example.com"]
}
```

### Secrets on DOKS — use Sealed Secrets or ESO

```bash
# Option A: Sealed Secrets (simpler, self-contained)
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal a secret (safe to commit to git)
kubectl create secret generic my-service-secrets \
  --from-literal=DATABASE_URL="postgres://..." \
  --dry-run=client -o yaml \
  | kubeseal --format yaml > sealed-secret.yaml

# Option B: External Secrets Operator with DO Secrets (via API)
# or with HashiCorp Vault running on DOKS
```

### CI/CD → DOCR → DOKS (GitHub Actions)

```yaml
- name: Install doctl
  uses: digitalocean/action-doctl@v2
  with:
    token: ${{ secrets.DO_TOKEN }}

- name: Log in to DOCR
  run: doctl registry login --expiry-seconds 600

- name: Build and push
  run: |
    docker build -t registry.digitalocean.com/my-company/my-service:${{ github.sha }} .
    docker push registry.digitalocean.com/my-company/my-service:${{ github.sha }}

- name: Deploy to DOKS
  run: |
    doctl kubernetes cluster kubeconfig save production
    helm upgrade --install my-service ./charts/my-service \
      --namespace production \
      --set image.repository=registry.digitalocean.com/my-company/my-service \
      --set image.tag=${{ github.sha }} \
      --wait --timeout=5m
```

### DigitalOcean services cheatsheet

| Need | DO service |
|---|---|
| Container orchestration | DOKS (Managed Kubernetes) |
| Serverless/PaaS deploys | App Platform |
| Virtual machines | Droplets |
| Managed PostgreSQL/MySQL/Redis | Managed Databases |
| Object storage (S3-compatible) | Spaces |
| CDN | Spaces CDN |
| DNS | DigitalOcean DNS |
| Load balancer | DO Load Balancer |
| Container registry | DOCR |
| Firewall | Cloud Firewall |
| VPN | WireGuard (self-hosted on Droplet) |

### doctl quick reference

```bash
# Kubernetes
doctl kubernetes cluster list
doctl kubernetes cluster kubeconfig save <cluster>
doctl kubernetes node-pool list <cluster>

# App Platform
doctl apps list
doctl apps logs <app-id> --follow

# Databases
doctl databases list
doctl databases connection <db-id> --user my-service

# Container Registry
doctl registry list
doctl registry repository list-tags my-service

# Account / billing
doctl account get
doctl balance get
```

---

## Multi-cloud / shared patterns

### Cost optimization checklist
- [ ] Right-size instances (use CPU/memory utilization data, not gut feeling)
- [ ] Spot/Preemptible instances for stateless batch/worker workloads
- [ ] Reserved instances for predictable baseline capacity (1-3yr, 30-60% savings)
- [ ] Turn off non-production environments on a schedule
- [ ] S3/GCS lifecycle policies to move old objects to cheaper storage tiers
- [ ] CloudFront/CDN for static assets (reduce origin egress cost)
- [ ] VPC endpoints to avoid NAT gateway charges for AWS-internal traffic
- [ ] Enable S3 Intelligent-Tiering for large buckets with unpredictable access

### Tagging strategy (enforce via policy)
```
Environment:   production | staging | dev
Team:          platform | backend | data
Service:       my-service
CostCenter:    12345
ManagedBy:     terraform
```
