# Forms (React Hook Form + Zod)

Contents: [Why this pairing](#why-this-pairing) · [Setup](#setup) · [Schema first](#schema-first) ·
[Basic form](#basic-form) · [shadcn form components](#shadcn-form-components) ·
[Dynamic & conditional fields](#dynamic--conditional-fields) · [Server errors](#server-errors) ·
[Accessibility](#accessibility) · [Pitfalls](#pitfalls)

## Why this pairing

React Hook Form keeps inputs uncontrolled, so typing in one field doesn't re-render the whole
form. On a 30-field form that's the difference between snappy and laggy. Zod defines the shape
once and gives you both runtime validation and the TypeScript type — the same schema can then
validate the API response, so client and server agree by construction.

```bash
npm i react-hook-form zod @hookform/resolvers
```

## Schema first

Write the schema before the JSX. It's the contract; the fields follow from it.

```ts
// src/features/auth/schemas.ts
import { z } from 'zod';

export const signupSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
    age: z.coerce.number().int().min(18, 'Must be 18 or older'),  // inputs give strings
    terms: z.literal(true, { message: 'You must accept the terms' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],   // attach the error to the field, not the form
  });

export type SignupInput = z.infer<typeof signupSchema>;
```

Write messages the user can act on. "Invalid" tells them nothing; "Include a number" tells them
exactly what to do next.

`z.coerce.number()` matters more than it looks — every `<input>` value is a string, so a plain
`z.number()` fails on valid input and the bug is easy to misdiagnose.

## Basic form

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',   // validate after first blur — not on every keystroke
    defaultValues: { email: '', password: '', confirmPassword: '', terms: false },
  });

  const onSubmit = async (data: SignupInput) => {
    await signup(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...register('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
```

Always supply `defaultValues`. Without them React Hook Form starts fields as `undefined`, React
treats the input as uncontrolled, and you get the "changing an uncontrolled input to controlled"
warning the first time a value arrives.

`mode: 'onTouched'` is the humane default. `onChange` shouts "invalid email" at someone who has
typed two characters; `onSubmit` alone makes them hunt for what went wrong after the fact.

## shadcn form components

If shadcn/ui is installed, its `Form` primitives wire up label association, error text, and ARIA
attributes automatically — worth using rather than repeating the boilerplate above.

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input type="email" autoComplete="email" {...field} />
          </FormControl>
          <FormDescription>We'll never share it.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
    <Button type="submit" disabled={form.formState.isSubmitting}>Submit</Button>
  </form>
</Form>
```

`FormField` with `control` is also how you integrate any controlled third-party input — date
pickers, selects, comboboxes — since `register` only works on native elements.

## Dynamic & conditional fields

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'members' });

{fields.map((field, index) => (
  // field.id, not index — index as key breaks when rows are removed
  <div key={field.id}>
    <input {...register(`members.${index}.email`)} />
    <button type="button" onClick={() => remove(index)}>Remove</button>
  </div>
))}
```

For a field that appears based on another:

```tsx
const accountType = useWatch({ control, name: 'accountType' });

{accountType === 'business' && <input {...register('taxId')} />}
```

`useWatch` subscribes only the component that calls it. `watch()` re-renders the whole form on
every change — fine at the top of a small form, costly in a large one.

Match the schema to the conditional shape with a discriminated union so the type narrows too:

```ts
const schema = z.discriminatedUnion('accountType', [
  z.object({ accountType: z.literal('personal') }),
  z.object({ accountType: z.literal('business'), taxId: z.string().min(1) }),
]);
```

## Server errors

Validation is never only client-side. The server owns truth — uniqueness, permissions, business
rules — and its errors need to land on the right fields.

```tsx
const onSubmit = async (data: SignupInput) => {
  try {
    await signup(data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      // { errors: { email: 'Already registered' } }
      for (const [field, message] of Object.entries(err.body.errors)) {
        setError(field as keyof SignupInput, { type: 'server', message });
      }
      return;
    }
    setError('root', { message: 'Something went wrong. Please try again.' });
  }
};
```

Render `errors.root?.message` somewhere visible near the submit button — a failure the user can't
see reads as a broken button.

## Accessibility

Forms are where accessibility failures hurt most, and the fixes are cheap:

- Every input has a `<label htmlFor>`. Placeholder text is not a label — it disappears on focus
  and is invisible to many screen readers.
- Errors get `role="alert"` and are linked via `aria-describedby` so they're announced.
- `aria-invalid` on the failing field.
- On submit failure, move focus to the first invalid field — otherwise a keyboard user has no idea
  where the problem is. `shouldFocusError: true` (the default) handles this.
- Real `autoComplete` values (`email`, `current-password`, `new-password`, `street-address`) —
  they cut form-filling time dramatically and are the difference between usable and painful on
  mobile.
- Group related radios/checkboxes in a `<fieldset>` with a `<legend>`.

## Pitfalls

**Missing `defaultValues`** → uncontrolled/controlled warning. Covered above; it's the most common
one by far.

**`z.number()` on a text input** → always fails. Use `z.coerce.number()`.

**Optional strings that are actually empty strings.** An untouched optional input submits `''`,
not `undefined`. Handle it: `z.string().email().optional().or(z.literal(''))`, or transform empty
to undefined before validation.

**Index as `key` in `useFieldArray`.** Removing row 2 makes React reuse the wrong DOM node and
values appear to jump between rows. Use `field.id`.

**Re-creating the resolver each render.** `zodResolver(schema)` with a schema defined outside the
component is fine; a schema built inline in the component body creates a new resolver every render.

**Validating only on the client.** Client validation is UX. The API must validate independently —
anyone can post directly to it.
