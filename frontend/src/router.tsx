import { createBrowserRouter } from 'react-router'
import { AppLayout, RouteError } from './layouts/AppLayout'

// Each page is its own chunk, loaded when its route is first visited
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    HydrateFallback: () => null,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./pages/SitePage')).SitePage }) },
      { path: 'suggest', lazy: async () => ({ Component: (await import('./pages/SuggestPage')).SuggestPage }) },
      { path: 'gaps', lazy: async () => ({ Component: (await import('./pages/GapsPage')).GapsPage }) },
      { path: 'new-poi', lazy: async () => ({ Component: (await import('./pages/NewPoiPage')).NewPoiPage }) },
      { path: 'pois/:nodeId?', lazy: async () => ({ Component: (await import('./pages/ExistingPoiPage')).ExistingPoiPage }) },
      { path: 'batch', lazy: async () => ({ Component: (await import('./pages/BatchPage')).BatchPage }) },
      { path: 'model', lazy: async () => ({ Component: (await import('./pages/ModelPage')).ModelPage }) },
    ],
  },
])
