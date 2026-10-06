// Session state for the renderer. A refresh of the page resets it, so the
// guard sends the user back to the login screen rather than exposing the app.
let authenticated = false

export function markAuthenticated(): void {
  authenticated = true
}

export function markLoggedOut(): void {
  authenticated = false
}

export function isAuthenticated(): boolean {
  return authenticated
}
