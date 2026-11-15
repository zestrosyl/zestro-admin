import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from './services/liveApi';
import { normalizeCurrencyLabel } from './services/api';
import {
  ActivityEvent,
  AuthenticatedAdminUser,
  Category,
  GalleryPhoto,
  HomepageConfig,
  MediaAsset,
  MenuItem,
  ModuleId,
  Order,
  OrderStatus,
  Promotion,
  RestaurantSettings,
  RestaurantTable,
  StaffMember,
  TenantInfo,
  ToastMessage,
  WaiterCall,
  WaiterCallStatus,
} from './types';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/ui/Primitives';
import { OverviewModule } from './modules/OverviewModule';
import { MenuModule } from './modules/MenuModule';
import { CategoriesModule } from './modules/CategoriesModule';
import { ImageLibraryModule } from './modules/ImageLibraryModule';
import { HomepageEditorModule } from './modules/HomepageEditorModule';
import { GalleryModule } from './modules/GalleryModule';
import { OrdersModule } from './modules/OrdersModule';
import { TablesModule } from './modules/TablesModule';
import { WaiterCallsModule } from './modules/WaiterCallsModule';
import { CustomersModule } from './modules/CustomersModule';
import { PromotionsModule } from './modules/PromotionsModule';
import { StaffModule } from './modules/StaffModule';
import { SettingsModule } from './modules/SettingsModule';

const EMPTY_HOMEPAGE_CONFIG: HomepageConfig = {
  heroImageKey: '',
  heroImageUrl: '',
  heroHeadline: 'ZESTRO',
  heroSubheadline: 'Contemporary Dining & Signature Cuisine',
  heroCtaText: 'Order Online',
  promoBannerEnabled: false,
  promoBannerText: '',
  promoBannerCode: '',
  sections: [
    { id: 'sec-hero', label: 'Hero Showcase', description: 'Full-bleed visual with headline & CTA', visible: true, order: 1 },
    { id: 'sec-featured', label: "Chef's Signatures", description: 'Featured seasonal menu items', visible: true, order: 2 },
    { id: 'sec-story', label: 'Culinary Philosophy', description: 'Brand story and sourcing', visible: true, order: 3 },
    { id: 'sec-gallery', label: 'Atmosphere Gallery', description: 'Curated interior & dish photography', visible: true, order: 4 },
    { id: 'sec-promos', label: 'Dining Offers', description: 'Active promotions and tasting events', visible: true, order: 5 },
  ],
};

const EMPTY_SETTINGS: RestaurantSettings = {
  restaurantName: 'ZESTRO',
  tagline: '',
  cuisineType: 'Contemporary Dining',
  currency: 'BDT (৳)',
  taxRatePercent: 0,
  serviceChargePercent: 0,
  deliveryFee: 60,
  minOrderAmount: 0,
  phone: '',
  whatsappNumber: '',
  email: '',
  address: '',
  openingHours: 'Daily · 12:00 PM – 11:00 PM',
  websiteUrl: 'https://zestro-customer-website.pages.dev',
  onlineOrderingEnabled: true,
  qrTableOrderingEnabled: true,
  autoAcceptOrders: false,
  waiterCallSoundEnabled: true,
  workerApiBaseUrl: 'https://zestro-admin-api.zestro-syl.workers.dev',
  r2PublicBucketUrl: 'https://zestro-customer-api.zestro-syl.workers.dev/api/media',
};

function mapMenuRow(row: Record<string, unknown>): MenuItem {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    categoryId: String(row.categoryId ?? ''),
    price:
      typeof row.price === 'number'
        ? row.price
        : Number(row.priceMinor ?? 0) / 100,
    description: String(row.description ?? ''),
    imageUrl: String(row.imageUrl ?? ''),
    imageKey: row.imageKey ? String(row.imageKey) : null,
    available: Boolean(row.available),
    featured: Boolean(row.featured),
    prepMinutes: Number(row.prepMinutes ?? 15),
    dietaryTags: Array.isArray(row.dietaryTags) ? (row.dietaryTags as string[]) : [],
    options:
      row.options && typeof row.options === 'object'
        ? (row.options as Record<string, unknown>)
        : undefined,
    ordersCount: Number(row.ordersCount ?? 0),
  };
}

export function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [openCreateMenuSignal, setOpenCreateMenuSignal] = useState(0);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthenticatedAdminUser | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [homepageConfig, setHomepageConfig] = useState<HomepageConfig>(EMPTY_HOMEPAGE_CONFIG);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings>(EMPTY_SETTINGS);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const pushLocalActivity = useCallback(
    (title: string, detail: string, type: ActivityEvent['type']) => {
      setActivities((prev) => [
        {
          id: `act-${Date.now()}-${Math.random()}`,
          title,
          detail,
          time: 'Just now',
          createdAt: new Date().toISOString(),
          type,
        },
        ...prev,
      ]);
    },
    []
  );

  // Purge legacy v1 demo localStorage keys so browser-cached mock state is never mistaken for live D1 data.
  useEffect(() => {
    try {
      const legacyKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('zestro-admin:v1:')) {
          legacyKeys.push(key);
        }
      }
      legacyKeys.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Ignore storage access errors in restricted privacy contexts.
    }
  }, []);

  const loadAllLiveData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setBootstrapping(true);
        setFatalError(null);
      } else {
        setRefreshing(true);
      }

      try {
        const me = await adminApi<{
          user: AuthenticatedAdminUser;
          restaurant: TenantInfo;
        }>('/api/me');

        setCurrentUser(me.user);
        setTenant(me.restaurant);
        setFatalError(null);

        const [
          settingsRes,
          categoriesRes,
          menuRes,
          ordersRes,
          tablesRes,
          callsRes,
          promosRes,
          staffRes,
          mediaRes,
          homepageRes,
          galleryRes,
          activitiesRes,
        ] = await Promise.allSettled([
          adminApi<RestaurantSettings>('/api/settings'),
          adminApi<Category[]>('/api/categories'),
          adminApi<Record<string, unknown>[]>('/api/menu'),
          adminApi<Order[]>('/api/orders'),
          adminApi<RestaurantTable[]>('/api/tables'),
          adminApi<WaiterCall[]>('/api/waiter-calls'),
          adminApi<Promotion[]>('/api/promotions'),
          adminApi<StaffMember[]>('/api/staff'),
          adminApi<MediaAsset[]>('/api/media'),
          adminApi<HomepageConfig>('/api/homepage'),
          adminApi<GalleryPhoto[]>('/api/gallery'),
          adminApi<ActivityEvent[]>('/api/activities'),
        ]);

        if (settingsRes.status === 'fulfilled') {
          setSettings({
            ...EMPTY_SETTINGS,
            ...settingsRes.value,
            restaurantName: settingsRes.value.restaurantName || me.restaurant.name || 'ZESTRO',
            currency: normalizeCurrencyLabel(settingsRes.value.currency || me.restaurant.currency),
          });
        } else {
          setSettings((prev) => ({
            ...prev,
            restaurantName: me.restaurant.name || prev.restaurantName,
            currency: normalizeCurrencyLabel(me.restaurant.currency || prev.currency),
          }));
        }

        if (categoriesRes.status === 'fulfilled') {
          setCategories(
            categoriesRes.value.map((x) => ({
              ...x,
              active: Boolean(x.active),
              sortOrder: Number(x.sortOrder) || 0,
              categoryType: x.categoryType === 'beverage' ? 'beverage' : 'food',
            }))
          );
        } else if (!silent) {
          notify(`Categories failed to load: ${categoriesRes.reason?.message || 'API error'}`, 'warning');
        }

        if (menuRes.status === 'fulfilled') {
          setMenuItems(menuRes.value.map(mapMenuRow));
        } else if (!silent) {
          notify(`Menu failed to load: ${menuRes.reason?.message || 'API error'}`, 'warning');
        }

        if (ordersRes.status === 'fulfilled') {
          setOrders(ordersRes.value);
        } else if (!silent) {
          notify(`Orders failed to load: ${ordersRes.reason?.message || 'API error'}`, 'warning');
        }

        if (tablesRes.status === 'fulfilled') {
          setTables(tablesRes.value);
        } else if (!silent) {
          notify(`Tables failed to load: ${tablesRes.reason?.message || 'API error'}`, 'warning');
        }

        if (callsRes.status === 'fulfilled') {
          setWaiterCalls(callsRes.value);
        } else if (!silent) {
          notify(`Waiter calls failed to load: ${callsRes.reason?.message || 'API error'}`, 'warning');
        }

        if (promosRes.status === 'fulfilled') {
          setPromotions(promosRes.value);
        } else if (!silent) {
          notify(`Promotions failed to load: ${promosRes.reason?.message || 'API error'}`, 'warning');
        }

        if (staffRes.status === 'fulfilled') {
          setStaff(staffRes.value);
        } else if (!silent) {
          notify(`Staff list failed to load: ${staffRes.reason?.message || 'API error'}`, 'warning');
        }

        if (mediaRes.status === 'fulfilled') {
          setMediaAssets(mediaRes.value);
        } else if (!silent) {
          notify(`Media library failed to load: ${mediaRes.reason?.message || 'API error'}`, 'warning');
        }

        if (homepageRes.status === 'fulfilled') {
          setHomepageConfig(homepageRes.value);
        } else if (!silent) {
          notify(`Homepage config failed to load: ${homepageRes.reason?.message || 'API error'}`, 'warning');
        }

        if (galleryRes.status === 'fulfilled') {
          setGalleryPhotos(galleryRes.value);
        } else if (!silent) {
          notify(`Gallery failed to load: ${galleryRes.reason?.message || 'API error'}`, 'warning');
        }

        if (activitiesRes.status === 'fulfilled') {
          setActivities(activitiesRes.value);
        }
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unable to authenticate with ZESTRO Admin API. Please sign in via Cloudflare Access and retry.';
        if (!silent) {
          setFatalError(msg);
        } else {
          notify(msg, 'warning');
        }
      } finally {
        setBootstrapping(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    void loadAllLiveData(false);
  }, [loadAllLiveData]);

  // Poll live operational queues (orders, waiter calls, tables, activity) every 20s while visible
  useEffect(() => {
    if (!currentUser || fatalError) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void Promise.allSettled([
        adminApi<Order[]>('/api/orders'),
        adminApi<WaiterCall[]>('/api/waiter-calls'),
        adminApi<RestaurantTable[]>('/api/tables'),
        adminApi<ActivityEvent[]>('/api/activities'),
      ]).then(([ordersRes, callsRes, tablesRes, actRes]) => {
        if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
        if (callsRes.status === 'fulfilled') setWaiterCalls(callsRes.value);
        if (tablesRes.status === 'fulfilled') setTables(tablesRes.value);
        if (actRes.status === 'fulfilled') setActivities(actRes.value);
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [currentUser, fatalError]);

  const role = currentUser?.role ?? 'viewer';
  const canManage = role === 'owner' || role === 'admin' || role === 'manager';
  const canManageStaff = role === 'owner' || role === 'admin';
  const canOperate = canManage || role === 'staff';
  const connected = Boolean(currentUser && tenant && !fatalError);

  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Preparing'
  ).length;
  const incomingWaiterCallsCount = waiterCalls.filter((w) => w.status === 'Incoming').length;

  return (
    <div className="flex min-h-screen bg-transparent text-[#F3EBDD]">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        pendingOrdersCount={pendingOrdersCount}
        incomingWaiterCallsCount={incomingWaiterCallsCount}
        restaurantName={settings.restaurantName || tenant?.name || 'ZESTRO'}
        currentUser={currentUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          activeModule={activeModule}
          onOpenMobileMenu={() => setMobileOpen(true)}
          incomingWaiterCallsCount={incomingWaiterCallsCount}
          onJumpToWaiterCalls={() => setActiveModule('waiter-calls')}
          onQuickAddMenu={() => {
            setActiveModule('menu');
            setOpenCreateMenuSignal((n) => n + 1);
          }}
          canManageCatalog={canManage}
          onRefresh={() => void loadAllLiveData(true)}
          refreshing={refreshing}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {bootstrapping ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border border-[#2C3D34] bg-[#1D2922]/80 p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#D7A65A]" />
              <h2 className="mt-4 font-serif text-xl font-semibold text-[#F3EBDD]">
                Connecting to ZESTRO Cloud
              </h2>
              <p className="mt-1.5 max-w-md text-xs text-[#F3EBDD]/65">
                Verifying your Cloudflare Access session and loading live restaurant records from D1 &amp; R2...
              </p>
            </div>
          ) : fatalError ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-rose-500/40 bg-[#1D2922] p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-serif text-xl font-semibold text-[#F3EBDD]">
                Live Backend Connection Failed
              </h2>
              <p className="mt-2 text-sm text-[#F3EBDD]/75">{fatalError}</p>
              <p className="mt-2 text-xs text-[#F3EBDD]/50">
                No offline or mock data is displayed so you never mistake local browser state for live restaurant records.
              </p>
              <button
                type="button"
                onClick={() => void loadAllLiveData(false)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D7A65A] px-5 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
              >
                <RefreshCw className="h-4 w-4" /> Retry Live Connection
              </button>
            </div>
          ) : (
            <div key={activeModule} className="module-enter">
              {activeModule === 'overview' && (
                <OverviewModule
                  orders={orders}
                  menuItems={menuItems}
                  currency={settings.currency}
                  tables={tables}
                  waiterCalls={waiterCalls}
                  activities={activities}
                  onNavigate={setActiveModule}
                />
              )}

              {activeModule === 'menu' && (
                <MenuModule
                  items={menuItems}
                  categories={categories}
                  currency={settings.currency}
                  mediaAssets={mediaAssets}
                  globalSearch={globalSearch}
                  openCreateSignal={openCreateMenuSignal}
                  canManage={canManage}
                  onAssetUploaded={(asset) => setMediaAssets((prev) => [asset, ...prev])}
                  onNotify={notify}
                  onSaveItem={async (item, isNew) => {
                    try {
                      const payload = {
                        name: item.name,
                        categoryId: item.categoryId || null,
                        description: item.description,
                        priceMinor: Math.round(item.price * 100),
                        imageKey: item.imageKey ?? null,
                        imageUrl: item.imageUrl || '',
                        available: item.available,
                        featured: item.featured,
                        prepMinutes: item.prepMinutes,
                        dietaryTags: item.dietaryTags,
                        options: item.options ?? {},
                      };
                      const result = await adminApi<{ id?: string; imageUrl?: string }>(
                        isNew ? '/api/menu' : `/api/menu/${item.id}`,
                        isNew ? 'POST' : 'PATCH',
                        payload
                      );
                      const saved: MenuItem = isNew
                        ? {
                            ...item,
                            id: result.id || item.id,
                            imageUrl: result.imageUrl ?? item.imageUrl,
                          }
                        : item;
                      setMenuItems((prev) =>
                        isNew ? [saved, ...prev] : prev.map((m) => (m.id === saved.id ? saved : m))
                      );
                      notify(isNew ? `Added "${item.name}"` : `Updated "${item.name}"`);
                      pushLocalActivity(
                        isNew ? 'Menu Item Added' : 'Menu Item Updated',
                        item.name,
                        'menu'
                      );
                      return true;
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Menu save failed', 'warning');
                      return false;
                    }
                  }}
                  onDeleteItem={(id) => {
                    void adminApi(`/api/menu/${id}`, 'DELETE')
                      .then(() => {
                        const target = menuItems.find((m) => m.id === id);
                        setMenuItems((prev) => prev.filter((m) => m.id !== id));
                        notify(`Deleted "${target?.name ?? 'item'}"`, 'warning');
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Menu delete failed', 'warning')
                      );
                  }}
                />
              )}

              {activeModule === 'categories' && (
                <CategoriesModule
                  categories={categories}
                  menuItems={menuItems}
                  canManage={canManage}
                  onSaveCategory={async (cat, isNew) => {
                    try {
                      const payload = {
                        name: cat.name,
                        slug: cat.slug,
                        description: cat.description,
                        categoryType: cat.categoryType || 'food',
                        sortOrder: cat.sortOrder,
                        active: cat.active,
                      };
                      const result = await adminApi<{ id?: string; slug?: string }>(
                        isNew ? '/api/categories' : `/api/categories/${cat.id}`,
                        isNew ? 'POST' : 'PATCH',
                        payload
                      );
                      const saved: Category = isNew
                        ? { ...cat, id: result.id || cat.id, slug: result.slug || cat.slug }
                        : cat;
                      setCategories((prev) =>
                        isNew ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))
                      );
                      notify(isNew ? `Created category "${cat.name}"` : `Updated "${cat.name}"`);
                      return true;
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Category save failed', 'warning');
                      return false;
                    }
                  }}
                  onDeleteCategory={(id) => {
                    void adminApi(`/api/categories/${id}`, 'DELETE')
                      .then(() => {
                        setCategories((prev) => prev.filter((x) => x.id !== id));
                        setMenuItems((prev) =>
                          prev.map((item) => (item.categoryId === id ? { ...item, categoryId: '' } : item))
                        );
                        notify('Category removed', 'warning');
                      })
                      .catch((error) =>
                        notify(
                          error instanceof Error ? error.message : 'Category delete failed',
                          'warning'
                        )
                      );
                  }}
                  onReorderCategory={(id, dir) => {
                    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
                    const idx = sorted.findIndex((c) => c.id === id);
                    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                    if (swapIdx < 0 || swapIdx >= sorted.length) return;
                    const reordered = [...sorted];
                    const [moved] = reordered.splice(idx, 1);
                    reordered.splice(swapIdx, 0, moved);
                    const normalized = reordered.map((c, index) => ({ ...c, sortOrder: index + 1 }));
                    const previous = categories;
                    setCategories(normalized);
                    void adminApi('/api/categories/reorder', 'POST', {
                      order: normalized.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
                    }).catch((error) => {
                      setCategories(previous);
                      notify(
                        error instanceof Error ? error.message : 'Category reorder failed',
                        'warning'
                      );
                    });
                  }}
                />
              )}

              {activeModule === 'images' && (
                <ImageLibraryModule
                  assets={mediaAssets}
                  canManage={canManage}
                  onAddAsset={(asset) => {
                    setMediaAssets((prev) => [asset, ...prev]);
                    notify(`Uploaded "${asset.title}" to R2`);
                  }}
                  onReplaceAsset={(updated) => {
                    setMediaAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                    notify('Image replaced in Cloudflare R2');
                  }}
                  onDeleteAsset={(id) => {
                    void adminApi(`/api/media/${id}`, 'DELETE')
                      .then(() => {
                        setMediaAssets((prev) => prev.filter((a) => a.id !== id));
                        notify('Image deleted from R2 library', 'warning');
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Image delete failed', 'warning')
                      );
                  }}
                  onNotify={(msg, tone = 'info') => notify(msg, tone)}
                />
              )}

              {activeModule === 'homepage' && (
                <HomepageEditorModule
                  config={homepageConfig}
                  mediaAssets={mediaAssets}
                  canManage={canManage}
                  onAssetUploaded={(asset) => setMediaAssets((prev) => [asset, ...prev])}
                  onNotify={notify}
                  onSaveConfig={async (next) => {
                    try {
                      await adminApi('/api/homepage', 'PUT', next);
                      setHomepageConfig(next);
                      notify('Homepage configuration published to live website');
                      return true;
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'Homepage publish failed',
                        'warning'
                      );
                      return false;
                    }
                  }}
                />
              )}

              {activeModule === 'gallery' && (
                <GalleryModule
                  photos={galleryPhotos}
                  mediaAssets={mediaAssets}
                  canManage={canManage}
                  onAssetUploaded={(asset) => setMediaAssets((prev) => [asset, ...prev])}
                  onNotify={notify}
                  onSavePhoto={async (photo, isNew) => {
                    try {
                      const result = await adminApi<{ id?: string; imageUrl?: string }>(
                        isNew ? '/api/gallery' : `/api/gallery/${photo.id}`,
                        isNew ? 'POST' : 'PATCH',
                        photo
                      );
                      const saved: GalleryPhoto = isNew
                        ? {
                            ...photo,
                            id: result.id || photo.id,
                            imageUrl: result.imageUrl || photo.imageUrl,
                          }
                        : photo;
                      setGalleryPhotos((prev) =>
                        isNew ? [...prev, saved] : prev.map((p) => (p.id === saved.id ? saved : p))
                      );
                      notify(isNew ? `Added "${photo.title}"` : `Updated "${photo.title}"`);
                      return true;
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Gallery save failed', 'warning');
                      return false;
                    }
                  }}
                  onMovePhoto={(id, dir) => {
                    const sorted = [...galleryPhotos].sort((a, b) => a.sortOrder - b.sortOrder);
                    const idx = sorted.findIndex((p) => p.id === id);
                    const swapIdx = dir === 'prev' ? idx - 1 : idx + 1;
                    if (swapIdx < 0 || swapIdx >= sorted.length) return;
                    const reordered = [...sorted];
                    const [moved] = reordered.splice(idx, 1);
                    reordered.splice(swapIdx, 0, moved);
                    const normalized = reordered.map((p, index) => ({ ...p, sortOrder: index + 1 }));
                    const previous = galleryPhotos;
                    setGalleryPhotos(normalized);
                    void adminApi('/api/gallery/reorder', 'POST', {
                      order: normalized.map((p) => ({ id: p.id, sortOrder: p.sortOrder })),
                    }).catch((error) => {
                      setGalleryPhotos(previous);
                      notify(
                        error instanceof Error ? error.message : 'Gallery reorder failed',
                        'warning'
                      );
                    });
                  }}
                  onDeletePhoto={(id) => {
                    void adminApi(`/api/gallery/${id}`, 'DELETE')
                      .then(() => {
                        setGalleryPhotos((prev) => prev.filter((p) => p.id !== id));
                        notify('Photo removed from gallery', 'warning');
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Photo delete failed', 'warning')
                      );
                  }}
                />
              )}

              {activeModule === 'orders' && (
                <OrdersModule
                  orders={orders}
                  menuItems={menuItems}
                  tables={tables}
                  currency={settings.currency}
                  taxRatePercent={settings.taxRatePercent}
                  serviceChargePercent={settings.serviceChargePercent}
                  deliveryFeeAmount={settings.deliveryFee}
                  restaurantName={settings.restaurantName}
                  globalSearch={globalSearch}
                  canOperate={canOperate}
                  onUpdateStatus={(id, status: OrderStatus) => {
                    void adminApi(`/api/orders/${id}`, 'PATCH', { status })
                      .then(() => {
                        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
                        notify(`Order updated to ${status}`);
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Order update failed', 'warning')
                      );
                  }}
                  onCreateOrder={async (payload) => {
                    try {
                      const created = await adminApi<Order>('/api/orders', 'POST', payload);
                      setOrders((prev) => [created, ...prev]);
                      if (payload.tableId) {
                        setTables((prev) =>
                          prev.map((t) =>
                            t.id === payload.tableId
                              ? { ...t, status: 'Occupied', activeOrderNumber: created.orderNumber }
                              : t
                          )
                        );
                      }
                      notify(`Order ${created.orderNumber} created`);
                      pushLocalActivity(
                        `New Order ${created.orderNumber}`,
                        `${created.customerName} • ${created.tableNumber}`,
                        'order'
                      );
                      return true;
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'Manual order creation failed',
                        'warning'
                      );
                      return false;
                    }
                  }}
                />
              )}

              {activeModule === 'tables' && (
                <TablesModule
                  tables={tables}
                  publicMenuBaseUrl={settings.websiteUrl}
                  canManage={canManage}
                  canOperate={canOperate}
                  onSaveTable={async (tbl, isNew) => {
                    try {
                      const payload = {
                        number: tbl.number,
                        zone: tbl.zone,
                        capacity: tbl.capacity,
                        status: tbl.status,
                      };
                      const result = await adminApi<{ id?: string; qrPath?: string }>(
                        isNew ? '/api/tables' : `/api/tables/${tbl.id}`,
                        isNew ? 'POST' : 'PATCH',
                        payload
                      );
                      const saved: RestaurantTable = isNew
                        ? {
                            ...tbl,
                            id: result.id || tbl.id,
                            qrPath: tbl.qrPath || result.qrPath || '',
                          }
                        : tbl;
                      setTables((prev) =>
                        isNew ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))
                      );
                      notify(isNew ? `Added table ${tbl.number}` : `Updated table ${tbl.number}`);
                      return true;
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Table save failed', 'warning');
                      return false;
                    }
                  }}
                  onDeleteTable={(id) => {
                    void adminApi(`/api/tables/${id}`, 'DELETE')
                      .then(() => {
                        setTables((prev) => prev.filter((t) => t.id !== id));
                        notify('Table removed', 'warning');
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Table delete failed', 'warning')
                      );
                  }}
                  onNotify={(msg, tone = 'info') => notify(msg, tone)}
                />
              )}

              {activeModule === 'waiter-calls' && (
                <WaiterCallsModule
                  calls={waiterCalls}
                  tables={tables}
                  canOperate={canOperate}
                  onUpdateStatus={(id, status: WaiterCallStatus) => {
                    void adminApi<{ assignedTo?: string }>(`/api/waiter-calls/${id}`, 'PATCH', { status })
                      .then((res) => {
                        setWaiterCalls((prev) =>
                          prev.map((x) =>
                            x.id === id
                              ? { ...x, status, assignedTo: res.assignedTo || x.assignedTo }
                              : x
                          )
                        );
                        notify(`Waiter call marked ${status}`);
                      })
                      .catch((error) =>
                        notify(error instanceof Error ? error.message : 'Waiter update failed', 'warning')
                      );
                  }}
                  onCreateCall={async (payload) => {
                    try {
                      const created = await adminApi<WaiterCall>('/api/waiter-calls', 'POST', payload);
                      setWaiterCalls((prev) => [created, ...prev]);
                      notify(`Logged ${created.requestType} for Table ${created.tableNumber}`);
                      return true;
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'Could not log waiter call',
                        'warning'
                      );
                      return false;
                    }
                  }}
                />
              )}

              {activeModule === 'customers' && (
                <CustomersModule
                  orders={orders}
                  currency={settings.currency}
                  globalSearch={globalSearch}
                />
              )}

              {activeModule === 'promotions' && (
                <PromotionsModule
                  promotions={promotions}
                  currency={settings.currency}
                  canManage={canManage}
                  onSavePromotion={async (promo, isNew) => {
                    try {
                      const result = await adminApi<{ id?: string; code?: string }>(
                        isNew ? '/api/promotions' : `/api/promotions/${promo.id}`,
                        isNew ? 'POST' : 'PATCH',
                        promo
                      );
                      const saved: Promotion = isNew
                        ? {
                            ...promo,
                            id: result.id || promo.id,
                            code: result.code || promo.code,
                          }
                        : promo;
                      setPromotions((prev) =>
                        isNew ? [saved, ...prev] : prev.map((p) => (p.id === saved.id ? saved : p))
                      );
                      notify(isNew ? `Created promo "${saved.code}"` : `Updated "${saved.code}"`);
                      return true;
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'Promotion save failed',
                        'warning'
                      );
                      return false;
                    }
                  }}
                  onDeletePromotion={(id) => {
                    void adminApi(`/api/promotions/${id}`, 'DELETE')
                      .then(() => {
                        setPromotions((prev) => prev.filter((p) => p.id !== id));
                        notify('Promotion deleted', 'warning');
                      })
                      .catch((error) =>
                        notify(
                          error instanceof Error ? error.message : 'Promotion delete failed',
                          'warning'
                        )
                      );
                  }}
                />
              )}

              {activeModule === 'staff' && (
                <StaffModule
                  staff={staff}
                  currentUserEmail={currentUser?.email}
                  canManageStaff={canManageStaff}
                  onSaveStaff={async (member, isNew) => {
                    try {
                      if (isNew) {
                        const created = await adminApi<StaffMember>('/api/staff', 'POST', member);
                        setStaff((prev) => [...prev, created]);
                        notify(`Invited ${created.name}`);
                      } else {
                        await adminApi(`/api/staff/${member.id}`, 'PATCH', member);
                        setStaff((prev) => prev.map((s) => (s.id === member.id ? member : s)));
                        notify(`Updated ${member.name}`);
                      }
                      return true;
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Staff save failed', 'warning');
                      return false;
                    }
                  }}
                  onDeleteStaff={(id) => {
                    void adminApi(`/api/staff/${id}`, 'DELETE')
                      .then(() => {
                        setStaff((prev) => prev.filter((s) => s.id !== id));
                        notify('Staff access revoked', 'warning');
                      })
                      .catch((error) =>
                        notify(
                          error instanceof Error ? error.message : 'Staff removal failed',
                          'warning'
                        )
                      );
                  }}
                />
              )}

              {activeModule === 'settings' && (
                <SettingsModule
                  settings={settings}
                  connected={connected}
                  canManage={canManage}
                  onSaveSettings={async (next) => {
                    try {
                      await adminApi('/api/settings', 'PUT', next);
                      setSettings({
                        ...next,
                        currency: normalizeCurrencyLabel(next.currency),
                      });
                      notify('Restaurant settings saved to Cloudflare D1');
                      return true;
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'Settings save failed',
                        'warning'
                      );
                      return false;
                    }
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

export default App;
