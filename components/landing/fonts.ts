import { IBM_Plex_Mono, Inter_Tight } from "next/font/google";

// Self-hosted at build time by next/font, so the CSP needs no font origins.
export const lpSans = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-lp-sans", display: "swap" });
export const lpMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-lp-mono", display: "swap" });
