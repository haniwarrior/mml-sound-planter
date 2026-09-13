// Sites supplies the ASSETS binding for dist/client. The application is client-only.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
