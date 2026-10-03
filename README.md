# Zulfaqar Jamal Portfolio

A small personal React/Vite portfolio and blog-style site.

## Ground rules

Please use the public interface as intended.

Do not attack, hack, scan, fuzz, overload, bypass, exploit, or attempt unauthorized access to the static portfolio, comments, local API, deployment services, or stored data. Do not use the site as a test target or attempt to access another visitor's information.

### Local AI API

The AI/chatbot API is tied to the local server and follows Singapore Time (SGT, UTC+8):

- Monday–Friday: 05:00–00:00
- Saturday: 24 hours
- Sunday: offline

Anonymous comments can remain available online through the separate comment service.

## Hiring view

For a cleaner recruiter-facing presentation:

`/port_resume?type_of_work_hiring`

A specific target can also be supplied, for example:

`/port_resume?type_of_work_hiring=technical_officer`

The page is designed as a professional resume-style view while the main site remains the interactive portfolio.

## Development

### Client

```powershell
cd client
npm install
npm run dev
```

### Local API

```powershell
cd server
npm install
npm run dev
```

### Admin

```powershell
cd admin
npm install
npm run dev
```
