## searchsegment

Fetch and extract the text content of a specific web page URL as clean markdown.

JSON schema:

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The absolute HTTP or HTTPS URL of the webpage to fetch."
    }
  },
  "required": ["url"],
  "additionalProperties": false
}
```

Usage:
- Provide the full URL of the webpage to extract content from.
- Useful for fetching the full content of documentation, search result targets, or articles.
