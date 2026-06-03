---
format: zopack
version: "1.0"
name: etok-homepage
author: etok.zo.computer
description: Ethan's homepage cloned into an editable Zo Space demo.
routes: 1
exported: 2026-06-03
---

# etok homepage

## Routes

### `/` (page, public)

```tsx
import { ZoElement } from "zo-element";

export default function Profile() {
  return (
    <main className="min-h-screen bg-[#0a100a] text-white">
      <h1>Ethan Davidson</h1>
      <p>aka etok</p>
      <p>AI engineer at Wazoo — imagination-driven engineering helping people realize their dreams with software.</p>
      <p>Los Angeles, CA</p>
      <section>
        <h2>About me</h2>
        <p>I like building things that are useful and a little weird. My work lives at the intersection of developer tooling, AI infrastructure, and open-source communities. I previously worked at Google on Hotel Center and Dataplex UI, and now run Wazoo Technologies full-time while maintaining FartLabs and various community projects.</p>
      </section>
      <section>
        <h2>Currently</h2>
        <p>Neuro-symbolic memory layer for AI agents — imagination-driven engineering helping people realize their dreams with software</p>
      </section>
      <ZoElement packPath="demo/zo-element-home.zopack.md" routePath="/" />
    </main>
  );
}
```
