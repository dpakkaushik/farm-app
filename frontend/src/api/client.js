export const farmApi = {
  getPlots:     () => Promise.reject('offline'),
  getDashboard: () => Promise.resolve({ data: null }),
  submitDiary:  () => Promise.resolve({ data: null }),
  saveMapState: () => Promise.resolve(),
  uploadFile:   () => Promise.resolve({ data: { public_url: null } }),
}

export const api = { loadAll: () => Promise.resolve({}) }
