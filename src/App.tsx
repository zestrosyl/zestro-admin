import { useEffect, useState } from 'react';
import { usePersistentState } from './hooks/usePersistentState';
import { adminApi } from './services/liveApi';
import {
  INITIAL_GALLERY_PHOTOS,
  INITIAL_HOMEPAGE_CONFIG,
  INITIAL_MEDIA_ASSETS,
  INITIAL_PROMOTIONS,
  INITIAL_SETTINGS,
  INITIAL_STAFF,
} from './data/mockData';
import {
  ActivityEvent,
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
  ToastMessage,
  WaiterCall,
  WaiterCallStatus,
  WaiterCallType,
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
import { PromotionsModule } from './modules/PromotionsModule';
import { StaffModule } from './modules/StaffModule';
import { SettingsModule } from './modules/SettingsModule';

export function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [openCreateMenuSignal, setOpenCreateMenuSignal] = useState(0);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mediaAssets, setMediaAssets] = usePersistentState<MediaAsset[]>('media-assets', INITIAL_MEDIA_ASSETS);
  const [homepageConfig, setHomepageConfig] = usePersistentState<HomepageConfig>('homepage-config', INITIAL_HOMEPAGE_CONFIG);
  const [galleryPhotos, setGalleryPhotos] = usePersistentState<GalleryPhoto[]>('gallery-photos', INITIAL_GALLERY_PHOTOS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>([]);
  const [promotions, setPromotions] = usePersistentState<Promotion[]>('promotions', INITIAL_PROMOTIONS);
  const [staff, setStaff] = usePersistentState<StaffMember[]>('staff', INITIAL_STAFF);
  const [settings, setSettings] = usePersistentState<RestaurantSettings>('settings', INITIAL_SETTINGS);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = (message: string, tone: ToastMessage['tone'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const logActivity = (title: string, detail: string, type: ActivityEvent['type']) => {
    setActivities((prev) => [{ id: `act-${Date.now()}`, title, detail, time: 'Just now', type }, ...prev]);
  };

  useEffect(() => {
    let active = true;
    // Never show persisted sample activity while the live account is loading.
    setActivities([]);
    (async () => {
      try {
        await adminApi('/api/me');
        if (!active) return;
        const endpoints = [
          ['/api/menu', setMenuItems, (rows: any[]) => rows.map((x) => ({
            id: x.id, name: x.name, categoryId: x.categoryId || '', price: Number(x.priceMinor || 0) / 100,
            description: x.description || '', imageUrl: '', available: Boolean(x.available), featured: Boolean(x.featured),
            prepMinutes: Number(x.prepMinutes || 0), dietaryTags: Array.isArray(x.dietaryTags) ? x.dietaryTags : [], ordersCount: 0,
          }))],
          ['/api/categories', setCategories, (rows: any[]) => rows.map((x) => ({...x, active:Boolean(x.active), sortOrder:Number(x.sortOrder)||0}))],
          ['/api/orders', setOrders, (rows: any[]) => rows],
          ['/api/tables', setTables, (rows: any[]) => rows],
          ['/api/waiter-calls', setWaiterCalls, (rows: any[]) => rows],
        ] as const;
        const results = await Promise.allSettled(endpoints.map(([path]) => adminApi<any[]>(path)));
        if (!active) return;
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const [, setter, transform] = endpoints[index];
            (setter as (value: any) => void)(transform(result.value));
          } else {
            const reason = result.reason;
            notify(reason instanceof Error ? reason.message : `Unable to load ${endpoints[index][0]}`, 'warning');
          }
        });
        setSettings((prev) => ({...prev, websiteUrl: prev.websiteUrl || 'https://zestro-customer-website.pages.dev', workerApiBaseUrl: 'https://zestro-admin-api.zestro-syl.workers.dev'}));
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : 'Admin authentication failed. Sign in again and refresh.', 'warning');
      }
    })();
    return () => { active = false; };
  }, []);

  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').length;
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
        restaurantName={settings.restaurantName}
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
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
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
              onSaveItem={(item, isNew) => {
                void (async () => {
                  try {
                    const payload = {name:item.name,categoryId:item.categoryId,description:item.description,priceMinor:Math.round(item.price*100),available:item.available,featured:item.featured,prepMinutes:item.prepMinutes};
                    const result = await adminApi<{id?:string}>(isNew?'/api/menu':`/api/menu/${item.id}`,isNew?'POST':'PATCH',payload);
                    const saved = isNew ? {...item,id:result.id||item.id} : item;
                    setMenuItems((prev) => isNew ? [saved,...prev] : prev.map((m)=>(m.id===saved.id?saved:m)));
                    notify(isNew ? `Added "${item.name}"` : `Updated "${item.name}"`);
                    logActivity(isNew ? 'Menu Item Added' : 'Menu Item Updated', item.name, 'menu');
                  } catch (error) { notify(error instanceof Error?error.message:'Menu save failed','warning'); }
                })();
              }}
              onDeleteItem={(id) => {
                void adminApi(`/api/menu/${id}`,'DELETE').then(() => {
                  const target=menuItems.find((m)=>m.id===id);
                  setMenuItems((prev)=>prev.filter((m)=>m.id!==id));
                  notify(`Deleted "${target?.name??'item'}"`,'warning');
                }).catch((error)=>notify(error instanceof Error?error.message:'Menu delete failed','warning'));
              }}
            />
          )}

          {activeModule === 'categories' && (
            <CategoriesModule
              categories={categories}
              menuItems={menuItems}
              onSaveCategory={(cat, isNew) => {
                void (async () => {
                  try {
                    const payload={name:cat.name,slug:cat.slug,description:cat.description,sortOrder:cat.sortOrder,active:cat.active};
                    const result=await adminApi<{id?:string}>(isNew?'/api/categories':`/api/categories/${cat.id}`,isNew?'POST':'PATCH',payload);
                    const saved=isNew?{...cat,id:result.id||cat.id}:cat;
                    setCategories((prev)=>isNew?[...prev,saved]:prev.map((x)=>x.id===saved.id?saved:x));
                    notify(isNew?`Created category "${cat.name}"`:`Updated "${cat.name}"`);
                  } catch(error) { notify(error instanceof Error?error.message:'Category save failed','warning'); }
                })();
              }}
              onDeleteCategory={(id) => {
                void adminApi(`/api/categories/${id}`,'DELETE').then(()=>{
                  setCategories((prev)=>prev.filter((x)=>x.id!==id));notify('Category removed','warning');
                }).catch((error)=>notify(error instanceof Error?error.message:'Category delete failed','warning'));
              }}
              onReorderCategory={(id, dir) => {
                const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
                const idx = sorted.findIndex((c) => c.id === id);
                const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                if (swapIdx < 0 || swapIdx >= sorted.length) return;
                const tempOrder = sorted[idx].sortOrder;
                sorted[idx] = { ...sorted[idx], sortOrder: sorted[swapIdx].sortOrder };
                sorted[swapIdx] = { ...sorted[swapIdx], sortOrder: tempOrder };
                setCategories(sorted);
              }}
            />
          )}

          {activeModule === 'images' && (
            <ImageLibraryModule
              assets={mediaAssets}
              onAddAsset={(asset) => {
                setMediaAssets((prev) => [asset, ...prev]);
                notify(`Uploaded "${asset.title}"`);
              }}
              onReplaceAsset={(id, newUrl, sizeKb) => {
                setMediaAssets((prev) =>
                  prev.map((a) => (a.id === id ? { ...a, url: newUrl, sizeKb } : a))
                );
                notify('Image replaced');
              }}
              onDeleteAsset={(id) => {
                setMediaAssets((prev) => prev.filter((a) => a.id !== id));
                notify('Image removed from library', 'warning');
              }}
              onNotify={(msg) => notify(msg, 'info')}
            />
          )}

          {activeModule === 'homepage' && (
            <HomepageEditorModule
              config={homepageConfig}
              mediaAssets={mediaAssets}
              onSaveConfig={(next) => {
                setHomepageConfig(next);
                notify('Homepage draft saved in this browser');
              }}
            />
          )}

          {activeModule === 'gallery' && (
            <GalleryModule
              photos={galleryPhotos}
              onSavePhoto={(photo, isNew) => {
                setGalleryPhotos((prev) =>
                  isNew ? [...prev, photo] : prev.map((p) => (p.id === photo.id ? photo : p))
                );
                notify(isNew ? `Added "${photo.title}"` : `Updated "${photo.title}"`);
              }}
              onMovePhoto={(id, dir) => {
                const sorted = [...galleryPhotos].sort((a, b) => a.sortOrder - b.sortOrder);
                const idx = sorted.findIndex((p) => p.id === id);
                const swapIdx = dir === 'prev' ? idx - 1 : idx + 1;
                if (swapIdx < 0 || swapIdx >= sorted.length) return;
                const temp = sorted[idx].sortOrder;
                sorted[idx] = { ...sorted[idx], sortOrder: sorted[swapIdx].sortOrder };
                sorted[swapIdx] = { ...sorted[swapIdx], sortOrder: temp };
                setGalleryPhotos(sorted);
              }}
              onDeletePhoto={(id) => {
                setGalleryPhotos((prev) => prev.filter((p) => p.id !== id));
                notify('Photo removed from gallery', 'warning');
              }}
            />
          )}

          {activeModule === 'orders' && (
            <OrdersModule
              orders={orders}
              menuItems={menuItems}
              currency={settings.currency}
              taxRatePercent={settings.taxRatePercent}
              serviceChargePercent={settings.serviceChargePercent}
              restaurantName={settings.restaurantName}
              globalSearch={globalSearch}
              onUpdateStatus={(id, status: OrderStatus) => {
                void adminApi(`/api/orders/${id}`,'PATCH',{status}).then(()=>{
                  setOrders((prev)=>prev.map((o)=>(o.id===id?{...o,status}:o)));
                  notify(`Order updated to ${status}`);
                }).catch((error)=>notify(error instanceof Error?error.message:'Order update failed','warning'));
              }}
              onCreateOrder={(order) => {
                setOrders((prev) => [order, ...prev]);
                notify(`Order ${order.orderNumber} created`);
                logActivity(`New Order ${order.orderNumber}`, `${order.customerName} • ${order.tableNumber}`, 'order');
              }}
            />
          )}

          {activeModule === 'tables' && (
            <TablesModule
              tables={tables}
              publicMenuBaseUrl={settings.websiteUrl}
              onSaveTable={(tbl, isNew) => {
                void (async()=>{
                  try{
                    const payload={number:tbl.number,zone:tbl.zone,capacity:tbl.capacity,status:tbl.status};
                    const result=await adminApi<{id?:string}>(isNew?'/api/tables':`/api/tables/${tbl.id}`,isNew?'POST':'PATCH',payload);
                    const saved=isNew?{...tbl,id:result.id||tbl.id}:tbl;
                    setTables((prev)=>isNew?[...prev,saved]:prev.map((x)=>x.id===saved.id?saved:x));
                    notify(isNew?`Added table ${tbl.number}`:`Updated table ${tbl.number}`);
                  }catch(error){notify(error instanceof Error?error.message:'Table save failed','warning')}
                })();
              }}
              onDeleteTable={(id) => {
                void adminApi(`/api/tables/${id}`,'DELETE').then(()=>{
                  setTables((prev)=>prev.filter((t)=>t.id!==id));notify('Table removed','warning');
                }).catch((error)=>notify(error instanceof Error?error.message:'Table delete failed','warning'));
              }}
              onNotify={(msg) => notify(msg, 'info')}
            />
          )}

          {activeModule === 'waiter-calls' && (
            <WaiterCallsModule
              calls={waiterCalls}
              onUpdateStatus={(id, status: WaiterCallStatus) => {
                void adminApi(`/api/waiter-calls/${id}`,'PATCH',{status}).then(()=>{
                  setWaiterCalls((prev)=>prev.map((x)=>x.id===id?{...x,status}:x));
                  notify(`Waiter call marked ${status}`);
                }).catch((error)=>notify(error instanceof Error?error.message:'Waiter update failed','warning'));
              }}
              onSimulateCall={(_type: WaiterCallType) => notify('Test calls are disabled on the live restaurant dashboard.','info')}
            />
          )}

          {activeModule === 'promotions' && (
            <PromotionsModule
              promotions={promotions}
              currency={settings.currency}
              onSavePromotion={(promo, isNew) => {
                setPromotions((prev) =>
                  isNew ? [promo, ...prev] : prev.map((p) => (p.id === promo.id ? promo : p))
                );
                notify(isNew ? `Created promo "${promo.code}"` : `Updated "${promo.code}"`);
              }}
              onDeletePromotion={(id) => {
                setPromotions((prev) => prev.filter((p) => p.id !== id));
                notify('Promotion deleted', 'warning');
              }}
            />
          )}

          {activeModule === 'staff' && (
            <StaffModule
              staff={staff}
              onSaveStaff={(member, isNew) => {
                setStaff((prev) =>
                  isNew ? [...prev, member] : prev.map((s) => (s.id === member.id ? member : s))
                );
                notify(isNew ? `Invited ${member.name}` : `Updated ${member.name}`);
              }}
              onDeleteStaff={(id) => {
                setStaff((prev) => prev.filter((s) => s.id !== id));
                notify('Staff access revoked', 'warning');
              }}
            />
          )}

          {activeModule === 'settings' && (
            <SettingsModule
              settings={settings}
              onSaveSettings={(next) => {
                setSettings(next);
                notify('Restaurant settings saved');
              }}
            />
          )}
          </div>
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
