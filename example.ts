import requestProxy from "./enhanceProxy";

// Example: Change the request body of a POST request to '/api/data'
const proxy = requestProxy({
  rules: [
    {
      match: (url, method) => url.includes("/api/data") && method === "POST",
      handler: async (request) => {
        // Assume the original body is JSON, and we want to add a 'timestamp'
        const originalBody = request.body;
        if (typeof originalBody === "string") {
          try {
            const data = JSON.parse(originalBody);
            data.timestamp = new Date().toISOString();
            request.setRequestHeader("X-Modified-By", "My-Proxy"); // Add a new header
            return JSON.stringify(data);
          } catch (e) {
            console.error("Failed to parse JSON body:", e);
            return originalBody; // Return the original body if parsing fails
          }
        }
        return originalBody;
      },
    },
    // Example: Block a specific request
    {
      match: (url, method) => url.includes("/sensitive-endpoint"),
      handler: async (request) => {
        console.warn("Blocking request to sensitive endpoint:", request.url);
        // Returning null or a specific value can effectively "block" or mock the request
        // For fetch, you might throw an error or return a mock Response object
        // For XHR, you might need to handle the response more explicitly, but returning a modified body is the main use case.
        throw new Error("Request blocked by proxy.");
      },
    },
    // Example: Modify GET request headers
    {
      match: (url, method) => url.includes("/api/info") && method === "GET",
      handler: async (request) => {
        request.setRequestHeader("Authorization", "Bearer my-secret-token");
        // We don't need to change the body for a GET request
        return request.body;
      },
    },
  ],
});

// To restore the original methods later
// proxy.restore();

// Example of making a proxied XMLHttpRequest call
const xhr = new XMLHttpRequest();
xhr.open("POST", "/api/data");
xhr.setRequestHeader("Content-Type", "application/json");
xhr.onload = function () {
  console.log("XHR Response:", this.responseText);
};
xhr.send(JSON.stringify({ message: "Hello, XHR!" }));

// Example of making a proxied Fetch call
fetch("/api/data", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "Hello, Fetch!" }),
})
  .then((response) => response.json())
  .then((data) => console.log("Fetch Response:", data))
  .catch((error) => console.error("Fetch Error:", error));

// Example of a request that will be blocked
fetch("/sensitive-endpoint").catch((error) => console.log(error.message));
