# Minitest 6 dropped Object#stub. Restore the Minitest 5 API used across the suite.
class Object
  def stub(name, val_or_callable, *block_args)
    new_name = :"__minitest_stub__#{name}"
    metaclass = singleton_class

    if respond_to?(name) && !methods.map(&:to_s).include?(name.to_s)
      metaclass.define_method(name) { |*args, **kwargs, &blk| super(*args, **kwargs, &blk) }
    end

    metaclass.alias_method(new_name, name)
    metaclass.define_method(name) do |*args, **kwargs, &blk|
      if val_or_callable.respond_to?(:call)
        val_or_callable.call(*args, **kwargs, &blk)
      else
        val_or_callable
      end
    end

    yield(*block_args)
  ensure
    metaclass.undef_method(name) if metaclass.method_defined?(name) || metaclass.private_method_defined?(name)
    if metaclass.method_defined?(new_name) || metaclass.private_method_defined?(new_name)
      metaclass.alias_method(name, new_name)
      metaclass.undef_method(new_name)
    end
  end
end
