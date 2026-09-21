# Kubernetes Reference

## Production-ready Deployment template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
  namespace: production
  labels:
    app: my-service
    version: v1.2.3
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0          # zero-downtime rolling update
  template:
    metadata:
      labels:
        app: my-service
        version: v1.2.3
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: my-service-sa  # dedicated SA, not default
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      topologySpreadConstraints:        # spread across zones
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: my-service
      containers:
        - name: my-service
          image: myregistry/my-service:v1.2.3   # never :latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /readyz
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          env:
            - name: APP_ENV
              value: production
          envFrom:
            - secretRef:
                name: my-service-secrets   # injected from Vault/ESO
          volumeMounts:
            - name: tmp
              mountPath: /tmp              # writable scratch space
      volumes:
        - name: tmp
          emptyDir: {}
```

## HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # avoid flapping
```

## PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-service-pdb
  namespace: production
spec:
  minAvailable: 2   # or use maxUnavailable: 1
  selector:
    matchLabels:
      app: my-service
```

## NetworkPolicy — default deny + explicit allow

```yaml
# Default deny all ingress/egress in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
# Allow ingress from ingress controller only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-controller
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: my-service
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
```

## Service + Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: production
spec:
  selector:
    app: my-service
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-service
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [my-service.example.com]
      secretName: my-service-tls
  rules:
    - host: my-service.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
```

## RBAC — least privilege ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-service-sa
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/my-service-role  # IRSA (AWS)
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: my-service-role
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list"]      # only what the app needs
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-service-rolebinding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: my-service-sa
roleRef:
  kind: Role
  name: my-service-role
  apiGroup: rbac.authorization.k8s.io
```

## Secrets — External Secrets Operator (preferred over native Secrets)

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: my-service-secrets
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend          # or aws-secretsmanager, gcp-secretmanager
    kind: ClusterSecretStore
  target:
    name: my-service-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: production/my-service
        property: database_url
```

## Useful kubectl debugging commands

```bash
# Pod logs with timestamps
kubectl logs -n production deploy/my-service --timestamps --tail=100

# Follow logs across all replicas
kubectl logs -n production -l app=my-service -f --max-log-requests=10

# Describe a crashing pod
kubectl describe pod -n production <pod-name>

# Execute into a pod
kubectl exec -it -n production <pod-name> -- /bin/sh

# Resource usage
kubectl top pods -n production --sort-by=cpu

# Events sorted by time
kubectl get events -n production --sort-by='.lastTimestamp'

# Port-forward for local debugging
kubectl port-forward -n production svc/my-service 8080:80
```

## Common crash causes & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `OOMKilled` | Memory limit too low | Increase `limits.memory` or fix leak |
| `CrashLoopBackOff` | App exits non-zero | Check logs; usually config/env issue |
| `ImagePullBackOff` | Wrong image tag or no pull secret | Verify tag; add `imagePullSecrets` |
| `Pending` | No node has capacity | Check `kubectl describe pod` for events |
| `0/N ready` readiness | Probe failing | Check probe path/port; app startup time |
