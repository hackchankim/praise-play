export const routes = {
  home: () => "/",
  signIn: () => "/sign-in",
  signUp: () => "/sign-up",
  songsUpload: () => "/songs/upload",
  songExtracting: (songId: string) => `/songs/${songId}/extracting`,
  songCorrection: (songId: string) => `/songs/${songId}/correction`,
  songArrangement: (songId: string) => `/songs/${songId}/arrangement`,
  setlist: (setlistId: string) => `/setlists/${setlistId}`,
  setlistPlay: (setlistId: string) => `/setlists/${setlistId}/play`,
} as const;
