import React from 'react';

const TestScroll: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <h1>滚动条测试页面</h1>
      <p>如果能看到这个页面，并且右侧有滚动条，说明滚动功能正常。</p>
      
      <div style={{ 
        marginTop: '24px', 
        padding: '20px', 
        background: '#f0f2f5', 
        borderRadius: '8px' 
      }}>
        <h2>测试内容（共 50 行）</h2>
        {Array.from({ length: 50 }, (_, i) => (
          <div key={i} style={{ 
            margin: '10px 0', 
            padding: '15px', 
            background: 'white', 
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            测试行 {i + 1} - 这是测试内容，用于验证滚动条是否正常工作。
          </div>
        ))}
      </div>
      
      <p style={{ marginTop: '24px', color: '#666' }}>
        如果看不到滚动条，请检查浏览器开发者工具的 Console 和 Elements 面板。
      </p>
    </div>
  );
};

export default TestScroll;
