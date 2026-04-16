"use client";

import { useEffect, useRef } from "react";
import { loadFull } from "tsparticles";

interface MedicalParticleBackgroundProps {
  className?: string;
  intensity?: "low" | "medium" | "high";
  theme?: "medical" | "dark" | "shiny";
}

export function MedicalParticleBackground({ 
  className = "", 
  intensity = "medium" 
}: MedicalParticleBackgroundProps) {
  const particlesInit = async (engine: any) => {
    await loadFull(engine);
  };

  const particlesLoaded = async (container: any) => {
    // Custom particle configuration for medical/scanner aesthetic
    const options = {
      background: {
        color: {
          value: "transparent"
        }
      },
      fpsLimit: 60,
      interactivity: {
        events: {
          onHover: {
            enable: true,
            mode: "repulse",
            parallax: {
              enable: true,
              force: intensity === "high" ? 60 : intensity === "medium" ? 40 : 20,
              smooth: 10
            }
          },
          resize: true
        },
        modes: {
          repulse: {
            distance: intensity === "high" ? 150 : intensity === "medium" ? 120 : 100,
            duration: 0.4,
            factor: 100
          }
        }
      },
      particles: {
        color: {
          value: ["#00f2ff", "#00ff88", "#ffffff", "#00aaff"]
        },
        links: {
          color: "rgba(0, 242, 255, 0.1)",
          distance: 150,
          enable: true,
          opacity: 0.1,
          width: 1
        },
        move: {
          direction: "none",
          enable: true,
          outModes: {
            default: "bounce"
          },
          random: false,
          speed: intensity === "high" ? 0.5 : intensity === "medium" ? 0.3 : 0.2,
          straight: false
        },
        number: {
          density: {
            enable: true,
            area: 800
          },
          value: intensity === "high" ? 60 : intensity === "medium" ? 40 : 25
        },
        opacity: {
          value: 0.6,
          animation: {
            enable: true,
            speed: 2,
            minimumValue: 0.1,
            sync: false
          }
        },
        shape: {
          type: ["circle", "star"],
          options: {
            star: {
              sides: 5
            }
          }
        },
        size: {
          value: { min: 1, max: 3 },
          animation: {
            enable: true,
            speed: 2,
            minimumValue: 0.5,
            sync: false
          }
        }
      },
      detectRetina: true,
      // Custom configuration for ring/halo effect
      emitters: [
        {
          direction: "none",
          rate: {
            quantity: 1,
            delay: 2
          },
          size: {
            width: 0,
            height: 0
          },
          position: {
            x: 50,
            y: 50
          }
        }
      ]
    };

    // Apply custom ring configuration
    const ringConfig = createRingConfiguration(intensity);
    Object.assign(options, ringConfig);

    await container.loadOptions(options);
  };

  // Function to create ring/halo configuration
  const createRingConfiguration = (intensity: string) => {
    const ringRadius = intensity === "high" ? 200 : intensity === "medium" ? 150 : 100;
    
    return {
      particles: {
        move: {
          enable: true,
          speed: intensity === "high" ? 0.8 : intensity === "medium" ? 0.5 : 0.3,
          direction: "none",
          random: false,
          straight: false,
          outModes: "bounce",
          // Custom circular motion
          path: {
            enable: true,
            options: {
              radius: ringRadius,
              center: { x: 50, y: 50 }
            }
          }
        }
      },
      emitters: [
        {
          position: { x: 50, y: 50 },
          rate: { quantity: 0, delay: 0 },
          size: { width: ringRadius * 2, height: ringRadius * 2 },
          life: { duration: 0, count: 1 }
        }
      ]
    };
  };

  return (
    <div className={`absolute inset-0 ${className}`}>
      <div 
        id="medical-particles"
        className="w-full h-full"
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}

// Alternative Canvas-based implementation for better performance
export function MedicalParticleRingCanvas({ 
  className = "", 
  intensity = "medium",
  theme = "medical"
}: MedicalParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{
    angle: number;
    speed: number;
    radius: number;
    size: number;
    opacity: number;
    pulse: number;
    type: 'ring' | 'sparkle';
  }>>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize main ring particles
    const particleCount = intensity === "high" ? 80 : intensity === "medium" ? 60 : 40;
    const ringRadius = intensity === "high" ? 250 : intensity === "medium" ? 200 : 150;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Initialize sparkle particles
    const sparkleCount = intensity === "high" ? 150 : intensity === "medium" ? 100 : 75;
    
    particlesRef.current = Array.from({ length: particleCount + sparkleCount }, (_, i) => {
      if (i < particleCount) {
        // Main ring particles - larger and more attractive
        const angle = (i / particleCount) * Math.PI * 2;
        return {
          angle: angle,
          speed: (Math.random() * 0.02 + 0.01) * (intensity === "high" ? 1.5 : intensity === "medium" ? 1 : 0.7),
          radius: ringRadius + (Math.random() - 0.5) * 60,
          size: Math.random() * 4 + 3, // Larger particles
          opacity: Math.random() * 0.4 + 0.5,
          pulse: Math.random() * Math.PI * 2,
          type: 'ring'
        };
      } else {
        // Sparkle particles - smaller and faster
        return {
          angle: Math.random() * Math.PI * 2,
          speed: (Math.random() * 0.04 + 0.02) * (intensity === "high" ? 2.5 : intensity === "medium" ? 2 : 1.5),
          radius: Math.random() * (window.innerWidth / 2) + 100,
          size: Math.random() * 1 + 0.3, // Smaller sparkle particles
          opacity: Math.random() * 0.2 + 0.1,
          pulse: Math.random() * Math.PI * 2,
          type: 'sparkle'
        };
      }
    });

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
      setTimeout(() => {
        mouseRef.current.active = false;
      }, 1000);
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Color schemes for different themes
    const colorSchemes = {
      medical: {
        primary: (opacity: number) => `rgba(0, 242, 255, ${opacity})`,
        secondary: (opacity: number) => `rgba(0, 170, 255, ${opacity})`,
        tertiary: (opacity: number) => `rgba(0, 255, 136, ${opacity})`,
        clear: 'rgba(0, 0, 0, 0)'
      },
      dark: {
        primary: (opacity: number) => `rgba(30, 30, 30, ${opacity})`,
        secondary: (opacity: number) => `rgba(50, 50, 50, ${opacity})`,
        tertiary: (opacity: number) => `rgba(70, 70, 70, ${opacity})`,
        clear: 'rgba(0, 0, 0, 0)'
      },
      shiny: {
        primary: (opacity: number) => `rgba(20, 20, 25, ${opacity})`,
        secondary: (opacity: number) => `rgba(40, 40, 50, ${opacity})`,
        tertiary: (opacity: number) => `rgba(100, 100, 120, ${opacity})`,
        clear: 'rgba(0, 0, 0, 0)'
      }
    };

    const scheme = colorSchemes[theme as keyof typeof colorSchemes] || colorSchemes.medical;

      // Animation loop
    const animate = () => {
      if (!ctx || !canvas) return;

      // Clear canvas with trail effect
      ctx.fillStyle = theme === 'medical' ? 'rgba(10, 15, 25, 0.1)' : 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;
      const mouseActive = mouseRef.current.active;

      particlesRef.current.forEach(particle => {
        // Update angle for orbital motion
        particle.angle += particle.speed;
        
        // Pulsing effect
        particle.pulse += 0.05;
        const pulseSize = Math.sin(particle.pulse) * 0.5 + 1;

        // Calculate position
        const x = centerX + Math.cos(particle.angle) * particle.radius;
        const y = centerY + Math.sin(particle.angle) * particle.radius;

        // Mouse interaction
        if (mouseActive) {
          const dx = x - mouseX;
          const dy = y - mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 200) {
            const force = (200 - distance) / 200;
            particle.radius += force * 2;
            particle.opacity = 0.8;
          } else {
            // Restore original radius based on particle type
            if (particle.type === 'ring') {
              particle.radius = ringRadius + (Math.random() - 0.5) * 60;
            }
            particle.opacity = particle.type === 'ring' ? Math.random() * 0.4 + 0.5 : Math.random() * 0.2 + 0.1;
          }
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(x, y, particle.size * pulseSize, 0, Math.PI * 2);
        
        // Theme-based color gradient
        const gradient = ctx.createRadialGradient(
          x, y, 0,
          x, y, particle.size * pulseSize * 2
        );
        
        if (theme === 'shiny') {
          // Shiny black gradient with metallic effect
          gradient.addColorStop(0, scheme.tertiary(particle.opacity * 0.9));
          gradient.addColorStop(0.3, scheme.secondary(particle.opacity * 0.6));
          gradient.addColorStop(0.6, scheme.primary(particle.opacity * 0.4));
          gradient.addColorStop(1, scheme.clear);
        } else if (theme === 'dark') {
          // Dark gradient
          gradient.addColorStop(0, scheme.tertiary(particle.opacity));
          gradient.addColorStop(0.5, scheme.secondary(particle.opacity * 0.5));
          gradient.addColorStop(1, scheme.clear);
        } else {
          // Medical gradient (default)
          gradient.addColorStop(0, scheme.primary(particle.opacity));
          gradient.addColorStop(0.5, scheme.secondary(particle.opacity * 0.5));
          gradient.addColorStop(1, scheme.clear);
        }

        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw connecting lines only for ring particles
        if (particle.type === 'ring') {
          // Draw wider, more attractive connecting lines
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            centerX + Math.cos(particle.angle + 0.1) * particle.radius,
            centerY + Math.sin(particle.angle + 0.1) * particle.radius
          );
          
          // Create gradient for the line
          const lineGradient = ctx.createLinearGradient(
            x, y,
            centerX + Math.cos(particle.angle + 0.1) * particle.radius,
            centerY + Math.sin(particle.angle + 0.1) * particle.radius
          );
          
          if (theme === 'shiny') {
            lineGradient.addColorStop(0, scheme.tertiary(particle.opacity * 0.3));
            lineGradient.addColorStop(0.5, scheme.tertiary(particle.opacity * 0.15));
            lineGradient.addColorStop(1, scheme.clear);
          } else {
            lineGradient.addColorStop(0, scheme.primary(particle.opacity * 0.4));
            lineGradient.addColorStop(0.5, scheme.primary(particle.opacity * 0.2));
            lineGradient.addColorStop(1, scheme.clear);
          }
          
          ctx.strokeStyle = lineGradient;
          ctx.lineWidth = theme === 'shiny' ? 2 : 1.5; // Wider edges for shiny theme
          ctx.stroke();
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [intensity]);

  return (
    <div className={`absolute inset-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}

// Simple CSS-based ring for minimal performance impact
export function MedicalRingBackground({ 
  className = "", 
  intensity = "medium" 
}: MedicalParticleBackgroundProps) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        style={{
          width: intensity === "high" ? "600px" : intensity === "medium" ? "500px" : "400px",
          height: intensity === "high" ? "600px" : intensity === "medium" ? "500px" : "400px",
          border: "1px solid rgba(0, 242, 255, 0.3)",
          borderRadius: "50%",
          animation: "pulse-ring 4s ease-in-out infinite",
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        style={{
          width: intensity === "high" ? "800px" : intensity === "medium" ? "650px" : "500px",
          height: intensity === "high" ? "800px" : intensity === "medium" ? "650px" : "500px",
          border: "1px solid rgba(0, 170, 255, 0.2)",
          borderRadius: "50%",
          animation: "pulse-ring 6s ease-in-out infinite reverse",
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
      <style jsx>{`
        @keyframes pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(0.95);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.05);
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.95);
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}

// Export the best implementation based on performance needs
export default MedicalParticleRingCanvas;