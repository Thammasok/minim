---
name: dependency-injection
description: Use when designing testable code with explicit, swappable dependencies
---

# Dependency Injection

## Purpose
Separate configuration from use. Make dependencies explicit, swappable, and testable by injecting them rather than constructing them internally.

## Principles
- Constructor injection is preferred — makes dependencies explicit and enables immutability.
- Dependencies should be injected, not created internally.
- Inversion of Control: the framework/container wires components, not the application code.
- Humble Object pattern: move hard-to-test logic out of difficult-to-test environments (UI, infrastructure).

## Rules
- **DO**: Use constructor injection for required dependencies.
- **DO**: Define interfaces for all service boundaries.
- **DO**: Keep constructors focused on assignment — no logic.
- **DO**: Apply Humble Object pattern: UI elements delegate to testable objects.
- **DON'T**: Create dependencies inside a class (use `new` for domain objects only).
- **DON'T**: Use service locator as a replacement for DI (it hides dependencies).
- **DON'T**: Put business logic in hard-to-test places (controllers, UI components).

## Patterns
### Constructor Injection
```
class UserService
  constructor(userRepository: UserRepository, emailGateway: EmailGateway)
    // Dependencies are injected, not created internally
    this.userRepository = userRepository
    this.emailGateway = emailGateway
```

### Humble Object
```
// Hard to test (UI component)
class LoginForm
  constructor(presenter: LoginPresenter)
  onSubmit()
    presenter.handleLogin(this.getFormData())

// Easy to test (pure logic)
class LoginPresenter
  handleLogin(data) -> result
    // All testable business logic lives here
```
