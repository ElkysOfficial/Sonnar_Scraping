/**
 * URL Shortener Service
 * Uses free URL shortening services (is.gd, TinyURL)
 */

import axios from "axios"

const SHORTENERS = [
  {
    name: "is.gd",
    url: "https://is.gd/create.php",
    method: "GET",
    params: (longUrl) => ({ format: "simple", url: longUrl }),
    parse: (response) => response.data
  },
  {
    name: "v.gd",
    url: "https://v.gd/create.php",
    method: "GET",
    params: (longUrl) => ({ format: "simple", url: longUrl }),
    parse: (response) => response.data
  },
  {
    name: "tinyurl",
    url: "https://tinyurl.com/api-create.php",
    method: "GET",
    params: (longUrl) => ({ url: longUrl }),
    parse: (response) => response.data
  }
]

// Cache for shortened URLs (in-memory)
const urlCache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Shorten a URL using available free services
 * @param {string} longUrl - URL to shorten
 * @returns {Promise<string>} Shortened URL or original if all services fail
 */
export async function shortenUrl(longUrl) {
  if (!longUrl || typeof longUrl !== "string") {
    return longUrl
  }

  // Check cache first
  const cached = urlCache.get(longUrl)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.shortUrl
  }

  // Try each shortener in order
  for (const shortener of SHORTENERS) {
    try {
      const response = await axios({
        method: shortener.method,
        url: shortener.url,
        params: shortener.params(longUrl),
        timeout: 5000
      })

      const shortUrl = shortener.parse(response)

      // Validate the response is a valid URL
      if (shortUrl && shortUrl.startsWith("http")) {
        // Cache the result
        urlCache.set(longUrl, {
          shortUrl,
          timestamp: Date.now()
        })
        return shortUrl
      }
    } catch (error) {
      console.warn(`URL shortener ${shortener.name} failed:`, error.message)
      continue
    }
  }

  // If all shorteners fail, return original URL
  console.warn("All URL shorteners failed, returning original URL")
  return longUrl
}

/**
 * Clear expired entries from cache
 */
export function clearExpiredCache() {
  const now = Date.now()
  for (const [key, value] of urlCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      urlCache.delete(key)
    }
  }
}

// Clear cache every hour
setInterval(clearExpiredCache, 60 * 60 * 1000)

export default { shortenUrl, clearExpiredCache }
