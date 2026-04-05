'use client';

import { SignIn } from '@clerk/nextjs';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <SignIn routing="hash" />
      </DialogContent>
    </Dialog>
  );
}
