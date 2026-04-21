// 组件导入测试文件
// 此文件用于验证所有新创建的组件可以正常导入

import React from 'react';
import DispatchModeSelector from './components/DispatchModeSelector';
import ExpertSelector from './components/ExpertSelector';
import CompanySelector from './components/CompanySelector';
import CriteriaSelector from './components/CriteriaSelector';

// 测试组件渲染
const ComponentTest: React.FC = () => {
  return (
    <div>
      <h1>组件导入测试</h1>
      
      {/* 测试 DispatchModeSelector */}
      <DispatchModeSelector 
        value="by_package" 
        onChange={(value) => console.log('DispatchMode changed:', value)} 
      />
      
      {/* 测试 ExpertSelector */}
      <ExpertSelector 
        teamId={1}
        onChange={(value) => console.log('Expert selected:', value)} 
      />
      
      {/* 测试 CompanySelector */}
      <CompanySelector 
        projectId={1}
        onChange={(values) => console.log('Companies selected:', values)} 
      />
      
      {/* 测试 CriteriaSelector */}
      <CriteriaSelector 
        packageId={1}
        onChange={(values) => console.log('Criteria selected:', values)} 
      />
    </div>
  );
};

export default ComponentTest;
