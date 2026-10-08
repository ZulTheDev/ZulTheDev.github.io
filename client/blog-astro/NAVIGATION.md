# Navigation system

The portfolio now uses one persistent **navigation island** instead of a left rail plus separate header menus.

## Placement

- Desktop: bottom-centre floating capsule.
- Mobile: the same capsule becomes horizontally compact and scrollable.
- The top of each page keeps only a lightweight site identity, not a second navigation bar.

## Why

This keeps the reading canvas clear, makes the navigation predictable between React and Astro routes, and avoids competing navigation surfaces.

## Route-specific items

The Astro layout accepts `navItems`, so each page can expose the most useful destinations without changing the navigation component.

Examples:

- Portfolio: Home / Tools / Mentor / Blog / Resume
- Blog: Home / Recent / CTF / Comic / Resume
- CTF archive: Home / Blog / Categories / Resume

The navigation island should remain the only persistent navigation surface as the remaining React pages migrate to Astro.
