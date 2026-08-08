require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

const PLACE_ID = process.env.GOOGLE_PLACE_ID;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// How often we're allowed to actually hit Google. Reviews don't change
// minute to minute, so a long TTL keeps you well inside the free quota.
// 6 hours = 4 calls/day = ~120/month, vs. the 1,000/month free allowance.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = { data: null, fetchedAt: 0 };

async function fetchGoogleRating() {
  const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      // Only ask for what you need — rating/userRatingCount are what
      // trigger the (paid-above-quota) Enterprise SKU, so don't add
      // extra fields you don't plan to show.
      'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,displayName',
    },
  });

  if (!res.ok) {
    throw new Error(`Google Places API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

app.get('/api/google-rating', async (req, res) => {
  const now = Date.now();

  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return res.json(cache.data);
  }

  try {
    const place = await fetchGoogleRating();
    const payload = {
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? 0,
      mapsUrl: place.googleMapsUri ?? null,
      name: place.displayName?.text ?? null,
    };
    cache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    console.error('Failed to fetch Google rating:', err.message);
    // If Google/network hiccups, serve the last good value instead of breaking the widget.
    if (cache.data) return res.json(cache.data);
    res.status(502).json({ error: 'Unable to fetch rating right now.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
