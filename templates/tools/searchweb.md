## searchweb

Use this tool to search the web using a query. This is a primary tool for discovering relevant URLs and summary snippets.

JSON schema:

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "A search query phrased as a clear, specific natural language question or statement."
    }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

Usage:
- Phrase query as natural language question.
