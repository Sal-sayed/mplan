# dataLayer event snippets — review & place

These are ready-to-use dataLayer pushes. Place each one in the matching action handler in your site and verify before relying on it. This file does not wire them up automatically.

> Each snippet must run at the moment the event actually happens — inside **your** form submit handler (after validation), button click handler, etc. This guide does **not** edit any of your existing code; you place each snippet yourself and confirm it fires (e.g. with GTM Preview or by logging `window.dataLayer`).

---

## `generate_lead` — _key event_

**Why:** A user submitted a lead generation form (e.g., 'SECURE MY SPOT').

**Fires when:** the “generate_lead” conversion completes.

**TODO:** place this in the code that runs when the conversion completes (e.g. the success / thank-you step), then **verify** it fires before relying on it.

```js
dataLayer.push({
  'event': 'generate_lead',
  'form_id': '\'contactForm\'',
  'form_name': '\'Contact Us Form\'',
  'form_purpose': '\'SECURE MY SPOT\'',
  'course_interest': '\'Web Design & Development\'',
});
```

---

## `contact` — _key event_

**Why:** A user initiated direct contact (e.g., clicked email, phone, or demo request).

**Fires when:** the “contact” conversion completes.

**TODO:** place this in the code that runs when the conversion completes (e.g. the success / thank-you step), then **verify** it fires before relying on it.

```js
dataLayer.push({
  'event': 'contact',
  'contact_type': '',
  'contact_target': '',
});
```

---

## `form_submit`

**Why:** A user submitted any form on the website.

**Fires when:** the “form_submit” form is submitted (after validation passes).

**TODO:** place this in your form’s submit handler, AFTER validation succeeds (never before validation), then **verify** it fires before relying on it.

```js
dataLayer.push({
  'event': 'form_submit',
  'form_id': '\'contactForm\'',
  'form_name': '\'Contact Us Form\'',
  'form_purpose': '\'SECURE MY SPOT\'',
  'form_fields': '\'name,phone,course\'',
});
```

---

## `view_promotion`

**Why:** A user viewed a promotion or banner.

**Fires when:** the “view_promotion” e-commerce step happens (e.g. add-to-cart, begin checkout, purchase).

**TODO:** place this in the handler for that e-commerce action (e.g. the add-to-cart / checkout button handler), then **verify** it fires before relying on it.

```js
dataLayer.push({
  'event': 'view_promotion',
  'promotion_id': '\'SUMMER_FLASH\'',
  'promotion_name': '\'Summer Flash Sale\'',
  'creative_name': '\'Banner 1\'',
  'creative_slot': '\'Top Banner\'',
});
```

---

## `select_promotion`

**Why:** A user clicked on a promotion or banner.

**Fires when:** the “select_promotion” e-commerce step happens (e.g. add-to-cart, begin checkout, purchase).

**TODO:** place this in the handler for that e-commerce action (e.g. the add-to-cart / checkout button handler), then **verify** it fires before relying on it.

```js
dataLayer.push({
  'event': 'select_promotion',
  'promotion_id': '\'SUMMER_FLASH\'',
  'promotion_name': '\'Summer Flash Sale\'',
  'creative_name': '\'Banner 1\'',
  'creative_slot': '\'Top Banner\'',
});
```
