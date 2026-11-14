import { useState } from 'react';
import { usePersistentState } from './hooks/usePersistentState';
import { useTheme } from './hooks/useTheme';
import {
  INITIAL_ACTIVITY,
  INITIAL_CATEGORIES,
  INITIAL_GALLERY_PHOTOS,
  INITIAL_HOMEPAGE_CONFIG,
  INITIAL_MEDIA_ASSETS,
  INITIAL_MENU_ITEMS,
  INITIAL_ORDERS,
  INITIAL_PROMOTIONS,
  INITIAL_SETTINGS,
  INITIAL_STAFF,
  INITIAL_TABLES,
  INITIAL_WAITER_CALLS,
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
  const [theme, toggleTheme] = useTheme();
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [openCreateMenuSignal, setOpenCreateMenuSignal] = useState(0);

  const [menuItems, setMenuItems] = usePersistentState<MenuItem[]>('menu-items', INITIAL_MENU_ITEMS);
  const [categories, setCategories] = usePersistentState<Category[]>('categories', INITIAL_CATEGORIES);
  const [mediaAssets, setMediaAssets] = usePersistentState<MediaAsset[]>('media-assets', INITIAL_MEDIA_ASSETS);
  const [homepageConfig, setHomepageConfig] = usePersistentState<HomepageConfig>('homepage-config', INITIAL_HOMEPAGE_CONFIG);
  const [galleryPhotos, setGalleryPhotos] = usePersistentState<GalleryPhoto[]>('gallery-photos', INITIAL_GALLERY_PHOTOS);
  const [orders, setOrders] = usePersistentState<Order[]>('orders', INITIAL_ORDERS);
  const [tables, setTables] = usePersistentState<RestaurantTable[]>('tables', INITIAL_TABLES);
  const [waiterCalls, setWaiterCalls] = usePersistentState<WaiterCall[]>('waiter-calls', INITIAL_WAITER_CALLS);
  const [promotions, setPromotions] = usePersistentState<Promotion[]>('promotions', INITIAL_PROMOTIONS);
  const [staff, setStaff] = usePersistentState<StaffMember[]>('staff', INITIAL_STAFF);
  const [settings, setSettings] = usePersistentState<RestaurantSettings>('settings', INITIAL_SETTINGS);
  const [activities, setActivities] = usePersistentState<ActivityEvent[]>('activity', INITIAL_ACTIVITY);
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

  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing').length;
  const incomingWaiterCallsCount = waiterCalls.filter((w) => w.status === 'Incoming').length;

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
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
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Modules not yet migrated to the new design system render on a dark canvas in the light theme. */}
          <div key={activeModule} className={`module-enter ${activeModule === 'overview' ? '' : 'legacy-dark'}`}>
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
                setMenuItems((prev) =>
                  isNew ? [item, ...prev] : prev.map((m) => (m.id === item.id ? item : m))
                );
                notify(isNew ? `Added "${item.name}"` : `Updated "${item.name}"`);
                logActivity(isNew ? 'Menu Item Added' : 'Menu Item Updated', item.name, 'menu');
              }}
              onDeleteItem={(id) => {
                const target = menuItems.find((m) => m.id === id);
                setMenuItems((prev) => prev.filter((m) => m.id !== id));
                notify(`Deleted "${target?.name ?? 'item'}"`, 'warning');
              }}
            />
          )}

          {activeModule === 'categories' && (
            <CategoriesModule
              categories={categories}
              menuItems={menuItems}
              onSaveCategory={(cat, isNew) => {
                setCategories((prev) =>
                  isNew ? [...prev, cat] : prev.map((c) => (c.id === cat.id ? cat : c))
                );
                notify(isNew ? `Created category "${cat.name}"` : `Updated "${cat.name}"`);
              }}
              onDeleteCategory={(id) => {
                setCategories((prev) => prev.filter((c) => c.id !== id));
                notify('Category removed', 'warning');
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
                setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
                notify(`Order updated to ${status}`);
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
                setTables((prev) =>
                  isNew ? [...prev, tbl] : prev.map((t) => (t.id === tbl.id ? tbl : t))
                );
                notify(isNew ? `Added table ${tbl.number}` : `Updated table ${tbl.number}`);
              }}
              onDeleteTable={(id) => {
                setTables((prev) => prev.filter((t) => t.id !== id));
                notify('Table removed', 'warning');
              }}
              onNotify={(msg) => notify(msg, 'info')}
            />
          )}

          {activeModule === 'waiter-calls' && (
            <WaiterCallsModule
              calls={waiterCalls}
              onUpdateStatus={(id, status: WaiterCallStatus) => {
                setWaiterCalls((prev) =>
                  prev.map((c) =>
                    c.id === id ? { ...c, status, assignedTo: c.assignedTo ?? 'Nadia Karim' } : c
                  )
                );
                notify(`Waiter call marked ${status}`);
              }}
              onSimulateCall={(type: WaiterCallType) => {
                const tbl = tables[Math.floor(Math.random() * tables.length)]?.number ?? 'T-03';
                const call: WaiterCall = {
                  id: `wc-${Date.now()}`,
                  tableNumber: tbl,
                  requestType: type,
                  note: 'Guest requested assistance via table QR menu.',
                  status: 'Incoming',
                  createdAt: 'Just now',
                };
                setWaiterCalls((prev) => [call, ...prev]);
                notify(`Incoming waiter call from ${tbl}`, 'warning');
                logActivity(`Waiter Call — ${tbl}`, type, 'waiter');
              }}
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
