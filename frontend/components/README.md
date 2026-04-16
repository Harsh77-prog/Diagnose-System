# Medical Particle Background Component

A futuristic healthcare AI background animation component for the Diagnose System web app.

## Overview

This component implements a "Soft Medical Particle Ring" background animation that creates a circular particle system (ring/halo shape) with orbit motion, subtle pulsing effects, and cursor interaction. 

**NEW**: Now supports gradient shiny black theme for dark UI designs while maintaining the same page white background with black text UI.

## Features

- **Circular Particle System**: Particles move in a ring/halo shape around the center
- **Orbit Motion**: Smooth circular movement along the particle path
- **Pulsing Effect**: Subtle heartbeat-like pulsing animation
- **Medical Color Scheme**: Soft medical blue/white/green tones with low opacity
- **Cursor Interaction**: Particles slightly repel when cursor moves near
- **Performance Optimized**: Canvas-based implementation for smooth rendering
- **React Compatible**: Built as a reusable React component

## Implementation Options

The component provides three different implementations:

### 1. MedicalParticleRingCanvas (Recommended)
- **Type**: Canvas-based animation
- **Performance**: High performance, smooth rendering
- **Features**: Full orbit motion, pulsing, cursor interaction
- **Usage**: `import { MedicalParticleRingCanvas } from "@/components/medical-particle-background"`

### 2. MedicalParticleBackground
- **Type**: tsParticles library implementation
- **Performance**: Good, but heavier than Canvas
- **Features**: Complex particle system with links and advanced effects
- **Usage**: `import { MedicalParticleBackground } from "@/components/medical-particle-background"`

### 3. MedicalRingBackground
- **Type**: CSS-only implementation
- **Performance**: Minimal performance impact
- **Features**: Simple pulsing rings, no particle motion
- **Usage**: `import { MedicalRingBackground } from "@/components/medical-particle-background"`

## Usage

### Basic Usage
```tsx
import { MedicalParticleRingCanvas } from "@/components/medical-particle-background";

function HeroSection() {
  return (
    <section className="relative">
      <MedicalParticleRingCanvas intensity="low" />
      {/* Your content here */}
    </section>
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `""` | Additional CSS classes |
| `intensity` | `"low" \| "medium" \| "high"` | `"medium"` | Animation intensity level |

### Intensity Levels

- **low**: Subtle, professional animation (recommended for production)
- **medium**: Moderate animation with more visible effects
- **high**: More pronounced animation for demonstration

## Integration

The component is already integrated into the main page hero section:

```tsx
// In frontend/app/(Main)/page.tsx
<MedicalParticleRingCanvas intensity="low" />
```

## Technical Details

### Canvas Implementation
- Uses HTML5 Canvas API for rendering
- Custom animation loop with `requestAnimationFrame`
- Mouse tracking for cursor interaction
- Responsive design that adapts to window size
- Performance-optimized with minimal DOM manipulation

### Color Scheme
- Medical blues: `rgba(0, 242, 255, ${opacity})`
- White accents: `rgba(255, 255, 255, ${opacity})`
- Green tones: `rgba(0, 170, 255, ${opacity})`
- Low opacity for non-distracting background effect

### Animation Features
- **Orbit Motion**: Particles follow circular paths
- **Pulsing**: Size and opacity variations over time
- **Cursor Repulsion**: Particles move away from mouse cursor
- **Smooth Transitions**: CSS transitions for cursor effects

## Performance Considerations

- Canvas-based rendering for optimal performance
- Limited particle count based on intensity level
- Efficient mouse event handling
- Responsive resize handling
- No blocking UI interactions

## Browser Support

- Modern browsers with Canvas API support
- Works on desktop and mobile devices
- No external dependencies required (uses built-in Canvas API)

## Customization

The component can be easily customized by modifying:

- Particle count and size
- Color scheme and gradients
- Animation speed and timing
- Cursor interaction sensitivity
- Ring radius and positioning

## Files

- `frontend/components/medical-particle-background.tsx` - Main component implementation
- `frontend/app/(Main)/page.tsx` - Integration example in hero section