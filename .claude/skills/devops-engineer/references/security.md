# Security & Secrets Management Reference

## Secrets — never store in git

### HashiCorp Vault — dynamic secrets
```bash
# Enable the database secrets engine
vault secrets enable database

# Configure PostgreSQL connection
vault write database/config/my-db \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@postgres:5432/mydb" \
  allowed_roles="my-service" \
  username="vault" \
  password="$(cat /run/secrets/vault-db-pass)"

# Create a role (short-lived creds)
vault write database/roles/my-service \
  db_name=my-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"
```

### External Secrets Operator — pull secrets into K8s
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: https://vault.example.com
      path: secret
      version: v2
      auth:
        kubernetes:
          mountPath: kubernetes
          role: my-service
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: my-service-db-creds
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: my-service-db-creds
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: production/my-service
        property: database_url
```

---

## Container security — hardening checklist

```yaml
# K8s securityContext — always set these
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 10001              # non-zero UID
  capabilities:
    drop: ["ALL"]
    add: []                    # add only specific caps if truly needed
  seccompProfile:
    type: RuntimeDefault        # or Localhost with custom profile
```

### OPA Gatekeeper / Kyverno policies
```yaml
# Kyverno: require non-root containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-non-root-containers
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-non-root
      match:
        resources:
          kinds: [Pod]
      validate:
        message: "Containers must not run as root"
        pattern:
          spec:
            containers:
              - securityContext:
                  runAsNonRoot: true
```

---

## Supply chain security

```bash
# Sign images with cosign (keyless, Sigstore)
cosign sign --oidc-issuer=https://token.actions.githubusercontent.com \
  myregistry/my-service:v1.2.3

# Verify before deploy
cosign verify --certificate-identity-regexp=".*" \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  myregistry/my-service:v1.2.3

# Generate SBOM
syft myregistry/my-service:v1.2.3 -o spdx-json > sbom.json
grype sbom:sbom.json           # scan SBOM for vulns
```

---

## Network security

```bash
# Scan for exposed ports / misconfigured services
nmap -sV --script=vuln 10.0.0.0/24

# TLS certificate check
openssl s_client -connect my-service.example.com:443 </dev/null 2>/dev/null \
  | openssl x509 -noout -dates -subject

# Check TLS configuration
testssl.sh my-service.example.com
```

### TLS — minimum standard
- TLS 1.2 minimum (prefer TLS 1.3 only where possible)
- Cipher suites: prefer ECDHE + AES-GCM
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- OCSP stapling enabled
- Certificate auto-rotation via cert-manager

---

## SAST / DAST in CI

```yaml
# GitHub Actions — SAST with CodeQL
- name: Initialize CodeQL
  uses: github/codeql-action/init@v3
  with:
    languages: javascript, python

- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v3

# Semgrep
- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
  with:
    config: p/owasp-top-ten p/secrets

# DAST with OWASP ZAP (run against staging)
- name: ZAP Baseline Scan
  uses: zaproxy/action-baseline@v0.10.0
  with:
    target: https://staging.example.com
```

---

## Incident security checklist (when a breach is suspected)

1. **Contain** — isolate affected workloads immediately
   ```bash
   kubectl cordon <node>
   kubectl delete pod <compromised-pod> -n production
   ```
2. **Preserve** — capture logs before deletion
   ```bash
   kubectl logs <pod> > incident-$(date +%s).log
   ```
3. **Revoke** — rotate all credentials the workload had access to
4. **Audit** — check cloud trail / K8s audit logs for lateral movement
5. **Notify** — follow your incident response plan; loop in security team
6. **Post-mortem** — blameless, within 5 business days
