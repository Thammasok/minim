---
name: solid-principles
description: Use when designing classes, modules, and interfaces for maintainable object-oriented code
---

# SOLID Principles

## Purpose
Guide object-oriented design toward maintainable, flexible, and understandable code. Each principle addresses a specific aspect of coupling and cohesion.

## Principles

### S — Single Responsibility Principle (SRP)
A class should have only one reason to change.

- One class = one actor (stakeholder) it serves
- If multiple actors can request changes to the same class, split it
- Symptoms of violation: "and" in class description, changes for unrelated reasons

### O — Open/Closed Principle (OCP)
Software entities should be open for extension but closed for modification.

- Add new behavior by adding new code, not changing existing code
- Use abstractions (interfaces, abstract classes) to enable extension
- Symptoms of violation: modifying existing code for every new feature

### L — Liskov Substitution Principle (LSP)
Subtypes must be substitutable for their base types.

- Derived classes must honor the contracts of their base classes
- No strengthening preconditions, no weakening postconditions
- Symptoms of violation: `instanceof` checks, unexpected exceptions in subclasses

### I — Interface Segregation Principle (ISP)
Clients should not be forced to depend on interfaces they do not use.

- Many specific interfaces are better than one general-purpose interface
- Design interfaces around client needs, not implementation convenience
- Symptoms of violation: empty method implementations, unused dependencies

### D — Dependency Inversion Principle (DIP)
High-level modules should not depend on low-level modules. Both should depend on abstractions.

- Abstractions should not depend on details. Details should depend on abstractions
- Inject dependencies; don't create them internally
- Symptoms of violation: `new` keyword for services, hard-coded infrastructure

## Rules

- **DO**: Design classes with a single, clear responsibility
- **DO**: Use interfaces to define extension points
- **DO**: Ensure subclasses can replace base classes without breaking behavior
- **DO**: Create focused interfaces tailored to specific clients
- **DO**: Depend on abstractions, inject concrete implementations
- **DON'T**: Create god classes that do everything
- **DON'T**: Modify existing code to add new features (extend instead)
- **DON'T**: Override methods with incompatible behavior
- **DON'T**: Force clients to implement methods they don't need
- **DON'T**: Hard-code dependencies inside classes

## Patterns

### SRP Example
```
// BAD: User class handles persistence, validation, and notification
class User {
  save() { /* DB logic */ }
  validate() { /* validation logic */ }
  sendEmail() { /* email logic */ }
}

// GOOD: Separate responsibilities
class User { /* domain data only */ }
class UserRepository { save(user) { } }
class UserValidator { validate(user) { } }
class UserNotifier { sendEmail(user) { } }
```

### OCP Example
```
// BAD: Modify switch statement for each new shape
calculateArea(shape) {
  switch(shape.type) {
    case 'circle': return π * r²
    case 'square': return s²
    // Must modify for each new shape
  }
}

// GOOD: Extend via new classes
interface Shape { area(): number }
class Circle implements Shape { area() { return π * r² } }
class Square implements Shape { area() { return s² } }
// New shapes = new classes, no modification
```

### LSP Example
```
// BAD: Square violates Rectangle contract
class Rectangle { setWidth(w); setHeight(h) }
class Square extends Rectangle {
  setWidth(w) { this.width = w; this.height = w }  // breaks expectations
}

// GOOD: Separate abstractions
interface Shape { area(): number }
class Rectangle implements Shape { }
class Square implements Shape { }
```

### ISP Example
```
// BAD: Fat interface forces empty implementations
interface Worker {
  work()
  eat()
  sleep()
}
class Robot implements Worker {
  work() { /* ok */ }
  eat() { /* robots don't eat! */ }
  sleep() { /* robots don't sleep! */ }
}

// GOOD: Segregated interfaces
interface Workable { work() }
interface Eatable { eat() }
interface Sleepable { sleep() }
class Robot implements Workable { work() { } }
class Human implements Workable, Eatable, Sleepable { }
```

### DIP Example
```
// BAD: High-level depends on low-level
class OrderService {
  constructor() {
    this.repository = new MySQLOrderRepository()  // hard-coded
  }
}

// GOOD: Both depend on abstraction
interface OrderRepository { save(order) }
class OrderService {
  constructor(repository: OrderRepository) {  // injected
    this.repository = repository
  }
}
class MySQLOrderRepository implements OrderRepository { }
class MongoOrderRepository implements OrderRepository { }
```

## When to Apply

| Symptom | Likely Violation | Fix |
|---------|------------------|-----|
| Class has multiple reasons to change | SRP | Split into focused classes |
| Adding features requires modifying existing code | OCP | Introduce abstractions |
| Subclass behaves unexpectedly | LSP | Redesign inheritance hierarchy |
| Implementing unused interface methods | ISP | Split interface |
| Hard to test due to concrete dependencies | DIP | Inject abstractions |
