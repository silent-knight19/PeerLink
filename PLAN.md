# Login Page Redesign Plan

## Goal
Transform the current simple login page into a modern split-layout design matching the provided screenshot, with smooth animations and transitions.

## Current State
- Simple centered card layout (400px max-width)
- Basic form with email/password fields
- Google OAuth button
- Plain CSS with minimal transitions
- No animation library installed

## Target Design (from screenshot)
- **Split layout**: Left panel (dark navy) + Right panel (white form)
- **Left panel**: 
  - Dark gradient background (#0a0e27 to #1a1f3a)
  - "Seamless video meetings for teams, anywhere." tagline
  - "Connect. Collaborate. Achieve more." (gradient text for "Achieve more")
  - Laptop mockup with video call UI
  - Subtle animated circles/rings
- **Right panel**:
  - White background with rounded corners
  - PeerLink logo with blue icon
  - "Sign Up" button (top right)
  - "Welcome Back" heading
  - "Sign in to your account to continue" subtitle
  - Email/Username input with mail icon
  - Password input with lock icon + eye toggle
  - "Forgot password?" link (blue)
  - Gradient Sign In button (blue → purple)
  - "or continue with" divider
  - Google and Microsoft OAuth buttons
  - Footer: copyright, Contact Us, English dropdown

## Implementation Steps

### Step 1: Install framer-motion
```bash
cd /Users/sachinkumarsingh/PeerLink/client && npm install framer-motion
```

### Step 2: Rewrite Login.tsx
Replace the current simple card layout with:
- Split container (flex row)
- Left panel with animated content
- Right panel with form
- Add framer-motion animations:
  - Fade-in + slide-up for left panel text
  - Staggered fade-in for form elements
  - Button hover/tap animations
  - Password visibility toggle animation
  - Smooth page transitions

### Step 3: Rewrite index.css
Replace current styles with:
- CSS variables for new color scheme
- Split layout styles
- Left panel styles (dark gradient, typography, laptop mockup)
- Right panel styles (form inputs with icons, gradient button)
- Animation keyframes
- Responsive design for mobile
- Hover/focus states with transitions

### Step 4: Add SVG Icons
Create inline SVGs for:
- Mail icon (email input)
- Lock icon (password input)
- Eye/eye-off icon (password toggle)
- Google icon
- Microsoft icon
- PeerLink logo icon
- Login arrow icon

### Step 5: Update Register.tsx (optional)
Apply similar styling to the registration page for consistency.

## Files to Modify
1. `/Users/sachinkumarsingh/PeerLink/client/package.json` - Add framer-motion
2. `/Users/sachinkumarsingh/PeerLink/client/src/pages/Login.tsx` - Complete rewrite
3. `/Users/sachinkumarsingh/PeerLink/client/src/index.css` - Complete rewrite

## Animation Details
- **Page load**: Left panel fades in from left, right panel fades in from right
- **Text**: Staggered fade-in + slide-up with 0.1s delay between elements
- **Inputs**: Focus state with border color transition + subtle scale
- **Buttons**: Hover scale(1.02), tap scale(0.98)
- **Password toggle**: Rotate animation on icon switch
- **Gradient button**: Background position animation on hover
- **Background circles**: Slow rotation animation (20s loop)

## Responsive Design
- Desktop: Side-by-side split layout
- Tablet: Side-by-side with reduced padding
- Mobile: Stacked layout (left panel becomes header)
