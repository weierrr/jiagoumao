# Design direction

Audience: one Shopify store operator. The home screen answers whether marketing is ready and what needs attention.
Palette: paper #f7f9fc, ink #182238, muted #748096, line #e5eaf2, violet #6c52d9, mint #1c8a69. Typography: Avenir Next for display, system Chinese for body, Menlo for IDs and status metadata. No external font request.
Layout: compact 224px left navigation, generous workspace, restrained lavender highlights. Signature: a delivery route strip connecting shop → consent → message → receipt; the same route vocabulary carries into the React Flow canvas.
Critique: avoid a generic KPI-only landing screen. Put the actual readiness and safe DEMO state beside the overview; values must come from the database. Charts carry explicit dates, no invented trend percentages. Working forms and empty states take priority over decoration.
