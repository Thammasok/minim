---
name: react-folder-structure
description: Use when setup react's project structure.
---

# React Folder Structure

## Page Structure Map

```text
Recommended Industry-Standard React.js Folder Structure
├── [](#a-complete-folder-structure)**A Complete Folder Structure**
├── [](#1-root-directory)1\. **Root Directory**
├── [](#2-raw-public-endraw-)2\. **`/public`**
├── [](#3-raw-src-endraw-)3\. **`/src`**
├── [](#4-raw-assets-endraw-)4\. **`/assets`**
├── [](#5-raw-components-endraw-)5\. **`/components`**
├── [](#6-raw-features-endraw-)6\. **`/features`**
├── [](#7-raw-hooks-endraw-)7\. **`/hooks`**
├── [](#8-raw-layouts-endraw-)8\. **`/layouts`**
├── [](#9-raw-pages-endraw-)9\. **`/pages`**
├── [](#10-raw-services-endraw-)10\. **`/services`**
├── [](#11-raw-store-endraw-)11\. **`/store`**
├── [](#12-raw-styles-endraw-)12\. **`/styles`**
├── [](#13-raw-types-endraw-)13\. **`/types`**
├── [](#14-raw-utils-endraw-)14\. **`/utils`**
├── [](#15-raw-config-endraw-)15\. **`/config`**
├── [](#conclusion)**Conclusion**
└── [](#enjoyed-this-post)Enjoyed this post?
```

---

For a **React project**, a well-organized folder structure is essential for maintainability, scalability, and ease of collaboration. The structure should be modular, flexible, and adaptable to different types of projects, whether you're building a small app or a large-scale enterprise application.

Here’s an updated folder structure for modern React projects, keeping in mind **best practices**, **scalability**, and **performance** A comprehensive, scalable structure used widely in production React apps (works great with Vite or CRA):

### [](#a-complete-folder-structure)**A Complete Folder Structure**

```
my-app/
├── public/
│   ├── favicon.ico
│   ├── robots.txt
│   └── index.html
│
├── src/
│   ├── assets/                  # Static assets
│   │   ├── images/
│   │   ├── fonts/
│   │   └── icons/
│   │
│   ├── components/               # Reusable, UI components
│   │   ├── common/               # Buttons, Inputs, Modals, etc.
│   │   │   ├── Button/
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Button.module.css
│   │   │   │   ├── Button.test.jsx
│   │   │   │   └── index.js
│   │   │   └── Modal/
│   │   └── layout/               # Header, Footer, Sidebar, Navbar
│   │       ├── Header/
│   │       └── Footer/
│   │
│   ├── features/                 # Feature-based modules (recommended for scale)
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/         # API calls specific to auth
│   │   │   ├── authSlice.js      # Redux slice / Zustand store
│   │   │   └── index.js
│   │   ├── dashboard/
│   │   └── profile/
│   │
│   ├── pages/                    # Route-level components / views
│   │   ├── Home/
│   │   │   ├── Home.jsx
│   │   │   └── Home.module.css
│   │   ├── About/
│   │   └── NotFound/
│   │
│   ├── routes/                   # Routing configuration
│   │   ├── AppRoutes.jsx
│   │   └── ProtectedRoute.jsx
│   │
│   ├── hooks/                    # Global/shared custom hooks
│   │   ├── useAuth.js
│   │   ├── useDebounce.js
│   │   └── useFetch.js
│   │
│   ├── context/                  # React Context providers
│   │   ├── ThemeContext.jsx
│   │   └── AuthContext.jsx
│   │
│   ├── store/                    # Global state management (Redux/Zustand/Recoil)
│   │   ├── index.js
│   │   └── slices/
│   │
│   ├── services/                 # API/axios instances, external service logic
│   │   ├── api.js                # Axios instance/config
│   │   ├── authService.js
│   │   └── userService.js
│   │
│   ├── utils/                    # Helper/utility functions
│   │   ├── formatDate.js
│   │   ├── validators.js
│   │   └── constants.js
│   │
│   ├── types/                    # TypeScript types/interfaces (if using TS)
│   │   ├── user.types.ts
│   │   └── api.types.ts
│   │
│   ├── styles/                   # Global styles
│   │   ├── globals.css
│   │   ├── variables.css
│   │   └── theme.js              # If using styled-components/MUI theme
│   │
│   ├── config/                   # App-level configuration
│   │   ├── env.js
│   │   └── appConfig.js
│   │
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx                  # Entry point (Vite) / index.js (CRA)
│   └── index.css
│
├── tests/                        # Global/integration tests (if not colocated)
│
├── .env
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── package.json
├── vite.config.js  (or webpack.config.js)
└── README.md
```

### [](#1-root-directory)1\. **Root Directory**

At the root of your project, you should have these typical files and directories:  

```
/my-app
  ├── /public/
  ├── /src/
  ├── /tests/
  ├── .env
  ├── .gitignore
  ├── .eslintrc.json (or .eslint.js)
  ├── package.json
  ├── vite.config.js (or webpack.config.js)
  └── README.md
```

### [](#2-raw-public-endraw-)2\. **`/public`**

The **public** folder contains static files that are served directly to the browser, such as the `index.html`, images, and other assets.  

```
/public
  ├── favicon.ico
  ├── /images/
  └── index.html
```

### [](#3-raw-src-endraw-)3\. **`/src`**

The **`src`** folder is where all of your React application code resides. This is where you'll spend most of your time.  

```
/src
  ├── /assets/           # Static assets (images, fonts, etc.)
  ├── /components/       # Reusable components
  ├── /features/         # Feature-specific logic and components (could be feature folders)
  ├── /hooks/            # Custom React hooks
  ├── /layouts/          # Layout components (e.g., Header, Footer, Sidebar)
  ├── /pages/            # Page components (routes)
  ├── /services/         # API requests, utilities, external service integrations
  ├── /store/            # State management (Redux, Zustand, Context API)
  ├── /styles/           # Global styles (CSS, SASS, Styled Components)
  ├── /types/            # TypeScript types (if using TS)
  ├── /utils/            # Utility functions, helpers, and constants
  ├── /app.jsx           # App component (entry point)
  ├── /index.jsx         # Main entry point for React
  ├── /router.jsx        # Routing (React Router setup)
  └── /config/           # Environment variables and configuration files
```

### [](#4-raw-assets-endraw-)4\. **`/assets`**

-   Store images, fonts, and other media assets here.
-   It's optional to break this into subfolders (e.g., `/images`, `/fonts`).

### [](#5-raw-components-endraw-)5\. **`/components`**

-   Contains all **reusable** UI components that can be shared across different parts of your app.
-   Example:

```
        /components
          ├── Button.jsx
          ├── Modal.jsx
          └── Navbar.jsx
```

### [](#6-raw-features-endraw-)6\. **`/features`**

-   Organize your components, hooks, and logic by **features** (also called **domain-based structure**). This helps separate code based on functionality rather than by component type, promoting better scalability and maintainability.
-   Example:

```
        /features
          ├── /auth/           # Authentication-related components, hooks, reducers
          ├── /dashboard/      # Dashboard components, hooks, etc.
          └── /profile/        # Profile-related components
```

### [](#7-raw-hooks-endraw-)7\. **`/hooks`**

-   Store **custom hooks** that can be reused across your app, such as data fetching, form handling, etc.
-   Example:

```
        /hooks
          ├── useAuth.js
          ├── useFetch.js
          └── useForm.js
```

### [](#8-raw-layouts-endraw-)8\. **`/layouts`**

-   Layout components like Header, Sidebar, Footer, etc., that are used across multiple pages.
-   Example:

```
        /layouts
          ├── MainLayout.jsx
          ├── AdminLayout.jsx
          └── DashboardLayout.jsx
```

### [](#9-raw-pages-endraw-)9\. **`/pages`**

-   Contains **page-level components** (typically mapped to routes) that use the components from `/features` or `/components`.
-   Example:

```
        /pages
            ├── Auth/
            │   └── SignInPage.jsx
            │   └── SignUpPage.jsx
          ├── Dashboard.jsx
          ├── Home.jsx
          ├── Users.jsx
          ├── Prodcuts.jsx
          └── ContactUs.jsx
```

### [](#10-raw-services-endraw-)10\. **`/services`**

-   Functions for **API requests**, integrating third-party services, or utilities that handle external communication.
-   This could also be the place for service hooks or API-related logic.
-   Example:

```
        /services
          ├── authService.js   # Authentication API
          └── apiService.js    # General API calls
```

### [](#11-raw-store-endraw-)11\. **`/store`**

-   If you’re using a **state management** solution like Redux, Zustand, or Context API, keep the logic and actions here.
-   Example (if using Redux):

```
        /store
          ├── /auth/          # Auth-related Redux slices
          ├── /user/          # User-related Redux slices
          └── store.js        # Global store configuration
```

### [](#12-raw-styles-endraw-)12\. **`/styles`**

-   Store global styles, theme files, or any **CSS/SASS** or **CSS-in-JS** styles here.
-   Example:

```
        /styles
          ├── index.css
          ├── theme.js        # For theme configuration in styled-components
          └── global.scss     # Global styles for the app
```

### [](#13-raw-types-endraw-)13\. **`/types`**

-   If using TypeScript, store your custom **types** or interfaces here for easier management and reusability.
-   Example:

```
        /types
          ├── auth.d.ts       # Types for authentication-related data
          ├── api.d.ts        # Types for API responses
          └── user.d.ts       # Types for user objects
```

### [](#14-raw-utils-endraw-)14\. **`/utils`**

-   General utility functions that are used across your app (e.g., date formatting, data validation, etc.).
-   Example:

```
        /utils
          ├── formatDate.js
          └── validateEmail.js
```

### [](#15-raw-config-endraw-)15\. **`/config`**

-   Store environment variables or app configuration settings here, such as the API base URL, feature flags, etc.
-   Example:

```
        /config
          ├── index.js        # Export environment variables and configurations
          ├── config.js       # Configuration file for app set
```

### [](#conclusion)**Conclusion**

This folder structure provides a flexible, scalable, and maintainable setup for React applications. It focuses on:

-   **Modularity**: Organizing by features or domains (vs. just by components).
-   **Reusability**: Components, hooks, and utilities can be easily shared.
-   **Scalability**: As your project grows, the structure allows for easy addition of new features or pages.
-   **Separation of Concerns**: Each part of the app (state, services, components) has its own dedicated space.

This structure works for both **small projects** and **large-scale applications**. You can always adjust the specifics depending on the complexity and requirements of your app.