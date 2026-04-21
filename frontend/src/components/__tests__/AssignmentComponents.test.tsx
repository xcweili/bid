import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DispatchModeSelector from '../DispatchModeSelector';
import ExpertSelector from '../ExpertSelector';
import CompanySelector from '../CompanySelector';
import CriteriaSelector from '../CriteriaSelector';
import AssignmentPreview from '../AssignmentPreview';

describe('DispatchModeSelector', () => {
  it('should render three mode options', () => {
    render(<DispatchModeSelector value="by_company" onChange={() => {}} />);
    
    expect(screen.getByText('按包分配')).toBeInTheDocument();
    expect(screen.getByText('按公司分配')).toBeInTheDocument();
    expect(screen.getByText('按评审项分配')).toBeInTheDocument();
  });

  it('should call onChange when mode is changed', () => {
    const handleChange = jest.fn();
    render(<DispatchModeSelector value="by_company" onChange={handleChange} />);
    
    const byPackageRadio = screen.getByText('按包分配').closest('input[type="radio"]');
    expect(byPackageRadio).not.toBeNull();
    if (byPackageRadio) {
      fireEvent.click(byPackageRadio);
      expect(handleChange).toHaveBeenCalledWith('by_package');
    }
  });

  it('should highlight selected mode', () => {
    render(<DispatchModeSelector value="by_criteria" onChange={() => {}} />);
    
    const byCriteriaRadio = screen.getByText('按评审项分配').closest('input[type="radio"]');
    expect(byCriteriaRadio).toBeChecked();
  });
});

describe('ExpertSelector', () => {
  const mockExperts = [
    { id: 1, name: '张三', role: '技术评审员' },
    { id: 2, name: '李四', role: '商务评审员' },
    { id: 3, name: '王五', role: '技术评审员' }
  ];

  it('should display all experts', () => {
    render(<ExpertSelector experts={mockExperts} value={[]} onChange={() => {}} />);
    
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('王五')).toBeInTheDocument();
  });

  it('should call onChange when expert is selected', () => {
    const handleChange = jest.fn();
    render(<ExpertSelector experts={mockExperts} value={[]} onChange={handleChange} />);
    
    const checkbox = screen.getByLabelText('张三');
    fireEvent.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledWith([1]);
  });

  it('should show selected experts as checked', () => {
    render(<ExpertSelector experts={mockExperts} value={[1, 3]} onChange={() => {}} />);
    
    const zhangsanCheckbox = screen.getByLabelText('张三');
    const lisiCheckbox = screen.getByLabelText('李四');
    
    expect(zhangsanCheckbox).toBeChecked();
    expect(lisiCheckbox).not.toBeChecked();
  });
});

describe('CompanySelector', () => {
  const mockCompanies = [
    { id: 1, name: 'XX 公司' },
    { id: 2, name: 'YY 公司' },
    { id: 3, name: 'ZZ 公司' }
  ];

  it('should display all companies', () => {
    render(<CompanySelector companies={mockCompanies} value={[]} onChange={() => {}} />);
    
    expect(screen.getByText('XX 公司')).toBeInTheDocument();
    expect(screen.getByText('YY 公司')).toBeInTheDocument();
    expect(screen.getByText('ZZ 公司')).toBeInTheDocument();
  });

  it('should call onChange when company is selected', () => {
    const handleChange = jest.fn();
    render(<CompanySelector companies={mockCompanies} value={[]} onChange={handleChange} />);
    
    const checkbox = screen.getByLabelText('XX 公司');
    fireEvent.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledWith([1]);
  });

  it('should handle empty companies list', () => {
    render(<CompanySelector companies={[]} value={[]} onChange={() => {}} />);
    
    expect(screen.getByText('暂无公司数据')).toBeInTheDocument();
  });
});

describe('CriteriaSelector', () => {
  const mockCriteria = [
    { id: 1, name: '技术方案', weight: 40 },
    { id: 2, name: '商务报价', weight: 30 },
    { id: 3, name: '售后服务', weight: 30 }
  ];

  it('should display all criteria with weights', () => {
    render(<CriteriaSelector criteria={mockCriteria} value={[]} onChange={() => {}} />);
    
    expect(screen.getByText('技术方案')).toBeInTheDocument();
    expect(screen.getByText('商务报价')).toBeInTheDocument();
    expect(screen.getByText('售后服务')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('should call onChange when criteria is selected', () => {
    const handleChange = jest.fn();
    render(<CriteriaSelector criteria={mockCriteria} value={[]} onChange={handleChange} />);
    
    const checkbox = screen.getByLabelText('技术方案');
    fireEvent.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledWith([1]);
  });
});

describe('AssignmentPreview', () => {
  it('should display preview data correctly', () => {
    const previewData = [
      {
        evaluator_id: 1,
        evaluator_name: '张三',
        company_id: 1,
        company_name: 'XX 公司',
        assignment_type: 'by_company'
      }
    ];
    
    render(
      <AssignmentPreview
        previewData={previewData}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('XX 公司')).toBeInTheDocument();
    expect(screen.getByText('按公司分配')).toBeInTheDocument();
  });

  it('should disable confirm button when previewData is empty', () => {
    render(
      <AssignmentPreview
        previewData={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    const confirmButton = screen.getByText('确认分配');
    expect(confirmButton).toBeDisabled();
  });

  it('should call onConfirm when button is clicked', () => {
    const handleConfirm = jest.fn();
    const handleCancel = jest.fn();
    
    const previewData = [
      {
        evaluator_id: 1,
        evaluator_name: '张三',
        company_id: 1,
        company_name: 'XX 公司',
        assignment_type: 'by_company'
      }
    ];
    
    render(
      <AssignmentPreview
        previewData={previewData}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
    
    const confirmButton = screen.getByText('确认分配');
    fireEvent.click(confirmButton);
    
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const handleConfirm = jest.fn();
    const handleCancel = jest.fn();
    
    const previewData = [
      {
        evaluator_id: 1,
        evaluator_name: '张三',
        company_id: 1,
        company_name: 'XX 公司',
        assignment_type: 'by_company'
      }
    ];
    
    render(
      <AssignmentPreview
        previewData={previewData}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
    
    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);
    
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('should display assignment type labels correctly', () => {
    const previewData = [
      { evaluator_id: 1, evaluator_name: '张三', company_id: 1, company_name: 'XX 公司', assignment_type: 'by_package' },
      { evaluator_id: 2, evaluator_name: '李四', company_id: 2, company_name: 'YY 公司', assignment_type: 'by_criteria' }
    ];
    
    render(
      <AssignmentPreview
        previewData={previewData}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    expect(screen.getByText('按包分配')).toBeInTheDocument();
    expect(screen.getByText('按评审项分配')).toBeInTheDocument();
  });
});
