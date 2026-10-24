# ذَوق · Thooq

> An Arabic-first AI agent that turns a group's shared cultural preferences into a gathering plan everyone can enjoy.

## The problem

Planning a Saudi gathering is rarely as simple as picking a popular restaurant. Hosts need to balance different tastes, generations, budgets, and the desired atmosphere—often through a long and inconclusive group chat.

## The solution

**Thooq (ذَوق)** is a culturally intelligent planning agent for Saudi gatherings.

1. The host creates an occasion and provides its goal, city, group size, age groups, and practical constraints.
2. Each guest answers three quick prompts and shares three favourites for each: cultural media, favourite places/experiences, and their ideal gathering mood.
3. Thooq uses Qloo's taste graph to find meaningful cultural affinities and the group's shared taste overlap.
4. The host receives a tailored gathering concept with a clear explanation of why it fits the specific group.

Instead of a generic "top places" list, Thooq can propose a calm dinner and specialty-coffee plan, a family-friendly outing, or a friends' evening based on the cultural connections the group shares.

## Why Qloo

Qloo is the product's core differentiator. A generic LLM can write a plausible recommendation, but it cannot reliably ground it in cultural affinities across music, film/TV, dining, fashion, travel, and more.

Thooq will use Qloo to:

- resolve guests' favourite cultural entities;
- discover taste affinities and a shared group overlap;
- find location-aware experience recommendations; and
- provide evidence for the explanation shown to the host.

Qloo results describe aggregate cultural affinities; Thooq does not use them to infer a person's identity or sensitive traits.

## Current prototype

The first interface prototype contains:

- a landing page;
- a host dashboard for occasion details, sharing the guest link, viewing replies, and reading a recommendation;
- a guest flow with three prompts and three favourites per prompt.

The live Qloo integration will run through a server-side endpoint. No Qloo credential is included in this repository or exposed in the browser.

## Run locally

This interface prototype has no build step. Open `index.html` in a browser.

## Project structure

```
index.html     # Landing page
admin.html     # Host dashboard
guest.html     # Guest taste questions
styles.css     # Arabic-first visual design
app.js         # Prototype interactions
```

## Technology

- HTML, CSS, and vanilla JavaScript
- Qloo Hackathon Kit / Qloo Harness (planned server-side integration)

## Privacy and credentials

Never commit a Qloo API key or put it in browser-side JavaScript. Credentials are configured only in a private local/server environment.

## License

MIT
