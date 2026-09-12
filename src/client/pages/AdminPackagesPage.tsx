import { Tabs } from 'antd';
import AdminPackages from './AdminPackages';
import AdminPackageGroups from './AdminPackageGroups';

export default function AdminPackagesPage() {
  return (
    <Tabs
      defaultActiveKey="packages"
      items={[
        { key: 'packages', label: '套餐', children: <AdminPackages /> },
        { key: 'groups', label: '分组', children: <AdminPackageGroups /> },
      ]}
    />
  );
}
