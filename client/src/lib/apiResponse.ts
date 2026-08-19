export function isUnexpectedHtmlApiResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return response.ok && contentType.includes("text/html");
}
