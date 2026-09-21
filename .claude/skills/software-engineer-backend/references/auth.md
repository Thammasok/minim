# Auth Reference

## JWT + Refresh Token Pattern

```
Access Token:   short-lived (15min), stored in memory (JS var)
Refresh Token:  long-lived (7d), stored in httpOnly cookie (not localStorage)
```

### Sign & verify
```typescript
import jwt from 'jsonwebtoken'
import { config } from '../config'

export const signAccessToken = (userId: string) =>
  jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '15m' })

export const signRefreshToken = (userId: string) =>
  jwt.sign({ sub: userId }, config.JWT_REFRESH_SECRET, { expiresIn: '7d' })

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, config.JWT_SECRET) as { sub: string }
```

### Auth middleware
```typescript
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = verifyAccessToken(auth.slice(7))
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

### Refresh endpoint
```typescript
router.post('/auth/refresh', async (req, res) => {
  const token = req.cookies.refreshToken
  if (!token) return res.status(401).json({ error: 'No refresh token' })
  try {
    const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as { sub: string }
    const accessToken = signAccessToken(payload.sub)
    res.json({ accessToken })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})
```

---

## RBAC (Role-Based Access Control)

```typescript
// Prisma schema
model User {
  id    String @id @default(cuid())
  role  Role   @default(USER)
}
enum Role { USER MODERATOR ADMIN }

// Guard middleware
export const requireRole = (...roles: Role[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user || !roles.includes(user.role))
      return res.status(403).json({ error: 'Forbidden' })
    next()
  }

// Usage
router.delete('/posts/:id', requireAuth, requireRole('ADMIN', 'MODERATOR'), deletePost)
```

---

## OAuth2 (Google example with Passport.js)

```typescript
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

passport.use(new GoogleStrategy({
  clientID: config.GOOGLE_CLIENT_ID,
  clientSecret: config.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  const user = await prisma.user.upsert({
    where: { googleId: profile.id },
    update: { name: profile.displayName },
    create: {
      googleId: profile.id,
      email: profile.emails![0].value,
      name: profile.displayName,
    }
  })
  done(null, user)
}))

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
router.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const token = signAccessToken((req.user as any).id)
    res.redirect(`${config.FRONTEND_URL}/auth/callback?token=${token}`)
  }
)
```
