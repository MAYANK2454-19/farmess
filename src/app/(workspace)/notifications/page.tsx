import { NotificationList } from "@/features/notifications/notification-list";

export default function NotificationsPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Notifications</h1>
          <p className="page-subtitle">
            Updates created for your account, such as buyer offers and changes to service requests.
          </p>
        </div>
      </div>
      <NotificationList />
    </main>
  );
}
